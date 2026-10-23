"""
Data acquisition module for ResQNet.
Pulls verified historical weather and reanalysis data (ECMWF ERA5 / ERA5-Land)
via the Open-Meteo Historical Archive API for key flood-monitoring locations
across Mangaluru and coastal Karnataka (2018-2024).

Licence: Copernicus Open Access / CC-BY 4.0
Source: European Centre for Medium-Range Weather Forecasts (ECMWF) via Open-Meteo
"""

import os
import time
import requests
import pandas as pd
import numpy as np

LOCATIONS = [
    {
        "id": "mangaluru_urban",
        "name": "Mangaluru Urban (Kottara/Pumpwell)",
        "latitude": 12.9141,
        "longitude": 74.8560,
        "elevation_m": 22.0,
        "basin": "Gurupura / Coastal",
        "slope_category": "lowland_urban"
    },
    {
        "id": "bantwal",
        "name": "Bantwal (Netravati Gauge)",
        "latitude": 12.8942,
        "longitude": 75.0345,
        "elevation_m": 35.0,
        "basin": "Netravati River",
        "slope_category": "floodplain_gauge"
    },
    {
        "id": "belthangady",
        "name": "Belthangady (Western Ghats Confluence)",
        "latitude": 13.0033,
        "longitude": 75.2974,
        "elevation_m": 120.0,
        "basin": "Netravati-Kumaradhara Foothills",
        "slope_category": "steep_foothill"
    },
    {
        "id": "ullal",
        "name": "Ullal (Netravati Estuary)",
        "latitude": 12.8055,
        "longitude": 74.8529,
        "elevation_m": 8.0,
        "basin": "Netravati Estuary / Tidal",
        "slope_category": "coastal_estuary"
    },
    {
        "id": "udupi",
        "name": "Udupi / Manipal (Swarna Basin)",
        "latitude": 13.3409,
        "longitude": 74.7421,
        "elevation_m": 39.0,
        "basin": "Swarna River",
        "slope_category": "coastal_plain"
    }
]

START_DATE = "2018-01-01"
END_DATE = "2024-12-31"
API_URL = "https://archive-api.open-meteo.com/v1/archive"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "raw_weather_2018_2024.csv")


def fetch_location_year(loc, year):
    """Fetch hourly and daily ERA5 reanalysis data for a single location and year."""
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    
    params = {
        "latitude": loc["latitude"],
        "longitude": loc["longitude"],
        "start_date": start_date,
        "end_date": end_date,
        "daily": ["precipitation_sum", "precipitation_hours", "wind_speed_10m_max"],
        "hourly": ["precipitation", "soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm"],
        "timezone": "Asia/Kolkata"
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            resp = requests.get(API_URL, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                print(f"Rate limited on {loc['id']} {year}, sleeping 5s...")
                time.sleep(5)
            else:
                print(f"Error {resp.status_code}: {resp.text}")
                time.sleep(2)
        except Exception as e:
            print(f"Attempt {attempt+1} failed for {loc['id']} {year}: {e}")
            time.sleep(2)
            
    raise RuntimeError(f"Failed to fetch data for {loc['id']} {year} after {max_retries} attempts")


def parse_and_aggregate(loc, raw_json):
    """Aggregate hourly and daily data into daily observation rows."""
    daily = raw_json["daily"]
    hourly = raw_json["hourly"]
    
    # Process hourly data
    df_hourly = pd.DataFrame({
        "time": pd.to_datetime(hourly["time"]),
        "precip_h": hourly.get("precipitation", [0.0]*len(hourly["time"])),
        "sm_surface": hourly.get("soil_moisture_0_to_7cm", [np.nan]*len(hourly["time"])),
        "sm_deep": hourly.get("soil_moisture_7_to_28cm", [np.nan]*len(hourly["time"]))
    })
    df_hourly["date"] = df_hourly["time"].dt.strftime("%Y-%m-%d")
    
    hourly_agg = df_hourly.groupby("date").agg(
        max_hourly_rain_mm=("precip_h", "max"),
        soil_moisture_surface_mean=("sm_surface", "mean"),
        soil_moisture_deep_mean=("sm_deep", "mean")
    ).reset_index()
    
    # Process daily data
    df_daily = pd.DataFrame({
        "date": daily["time"],
        "precipitation_sum_mm": daily["precipitation_sum"],
        "precipitation_hours": daily["precipitation_hours"],
        "wind_speed_10m_max_kmh": daily["wind_speed_10m_max"]
    })
    
    merged = pd.merge(df_daily, hourly_agg, on="date", how="left")
    merged["location_id"] = loc["id"]
    merged["location_name"] = loc["name"]
    merged["latitude"] = loc["latitude"]
    merged["longitude"] = loc["longitude"]
    merged["elevation_m"] = loc["elevation_m"]
    merged["basin"] = loc["basin"]
    merged["slope_category"] = loc["slope_category"]
    
    return merged


def fetch_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_dfs = []
    years = list(range(2018, 2025))
    
    print(f"Fetching historical weather data for {len(LOCATIONS)} locations across {years}...")
    
    for loc in LOCATIONS:
        print(f"\n-> Fetching location: {loc['name']} ({loc['id']})")
        for year in years:
            print(f"   Fetching year {year}...", end=" ", flush=True)
            raw = fetch_location_year(loc, year)
            df_year = parse_and_aggregate(loc, raw)
            all_dfs.append(df_year)
            print(f"Done ({len(df_year)} days).")
            time.sleep(0.5) # Polite delay
            
    final_df = pd.concat(all_dfs, ignore_index=True)
    final_df.sort_values(by=["location_id", "date"], inplace=True)
    final_df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSuccessfully saved {len(final_df)} historical observation records to {OUTPUT_PATH}")
    return final_df


if __name__ == "__main__":
    fetch_all()
