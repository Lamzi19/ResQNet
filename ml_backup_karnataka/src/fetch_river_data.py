"""
River & Catchment Hydrology Fetcher for ResQNet.
Pulls historical river discharge (m3/s) from the Copernicus Global Flood Awareness System (GloFAS)
via Open-Meteo Flood API for key river stations across coastal Karnataka (2018-2024).

Licence: Copernicus Open Access / CC-BY 4.0
Source: European Centre for Medium-Range Weather Forecasts (ECMWF) GloFAS
"""

import os
import time
import requests
import pandas as pd
import numpy as np

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "raw_river_discharge_2018_2024.csv")
API_URL = "https://flood-api.open-meteo.com/v1/flood"

RIVER_STATIONS = [
    {
        "id": "bantwal",
        "name": "Bantwal (Netravati Gauge)",
        "latitude": 12.8942,
        "longitude": 75.0345,
        "basin": "Netravati River Mainstream",
        "danger_discharge_m3s": 1000.0,
        "warning_discharge_m3s": 650.0
    },
    {
        "id": "belthangady",
        "name": "Belthangady (Netravati Headwaters)",
        "latitude": 13.0033,
        "longitude": 75.2974,
        "basin": "Netravati-Kumaradhara Confluence",
        "danger_discharge_m3s": 750.0,
        "warning_discharge_m3s": 450.0
    },
    {
        "id": "mangaluru_urban",
        "name": "Mangaluru Urban (Gurupura River)",
        "latitude": 12.9141,
        "longitude": 74.8560,
        "basin": "Gurupura / Netravati Estuary",
        "danger_discharge_m3s": 600.0,
        "warning_discharge_m3s": 400.0
    },
    {
        "id": "ullal",
        "name": "Ullal (Netravati Estuarine Outlet)",
        "latitude": 12.8055,
        "longitude": 74.8529,
        "basin": "Netravati Estuary",
        "danger_discharge_m3s": 1100.0,
        "warning_discharge_m3s": 700.0
    },
    {
        "id": "udupi",
        "name": "Udupi (Swarna River Basin)",
        "latitude": 13.3409,
        "longitude": 74.7421,
        "basin": "Swarna River",
        "danger_discharge_m3s": 500.0,
        "warning_discharge_m3s": 320.0
    }
]


def fetch_station_river(station):
    print(f"Fetching GloFAS discharge for {station['name']} ({station['id']})...", end=" ", flush=True)
    params = {
        "latitude": station["latitude"],
        "longitude": station["longitude"],
        "start_date": "2018-01-01",
        "end_date": "2024-12-31",
        "daily": ["river_discharge"]
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            r = requests.get(API_URL, params=params, timeout=30)
            if r.status_code == 200:
                data = r.json()
                daily = data.get("daily", {})
                df = pd.DataFrame({
                    "date": daily.get("time", []),
                    "river_discharge_m3s": daily.get("river_discharge", [])
                })
                df["location_id"] = station["id"]
                df["basin"] = station["basin"]
                df["danger_discharge_m3s"] = station["danger_discharge_m3s"]
                df["warning_discharge_m3s"] = station["warning_discharge_m3s"]
                print(f"Done ({len(df)} days).")
                return df
            elif r.status_code == 429:
                print("Rate limited, sleeping 5s...")
                time.sleep(5)
            else:
                print(f"Error {r.status_code}: {r.text}")
                time.sleep(2)
        except Exception as e:
            print(f"Attempt {attempt+1} error: {e}")
            time.sleep(2)
            
    raise RuntimeError(f"Failed to fetch river discharge for {station['id']}")


def fetch_all_rivers():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    dfs = []
    for st in RIVER_STATIONS:
        df_st = fetch_station_river(st)
        dfs.append(df_st)
        time.sleep(1) # Polite pause
        
    final_df = pd.concat(dfs, ignore_index=True)
    final_df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSuccessfully saved {len(final_df)} river discharge records to {OUTPUT_PATH}")
    return final_df


if __name__ == "__main__":
    fetch_all_rivers()
