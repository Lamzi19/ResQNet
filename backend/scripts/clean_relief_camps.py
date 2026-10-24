"""
ResQNet Data Cleaning Script: Kerala Relief Camps & Evacuation Facilities
========================================================================

Parses, cleans, and standardizes the historical Kerala relief camps dataset
from the SEOC GIS workbook (`data/source/kerala_relief_camps.xlsx`).

Design Principles:
1. Non-destructive: Does NOT alter the original Excel file.
2. Provenance preservation: Keeps original fields (source_x, source_y, raw capacity).
3. Strict truthfulness: Does NOT invent coordinates, capacities, phone numbers, or operational status.
4. Segregates records without valid coordinates into a dedicated review report.
5. Emits cleaned datasets for backend and frontend mapping.
"""

import os
import json
import shutil
import openpyxl
import pandas as pd
import numpy as np
from datetime import datetime

# Input paths
PRIMARY_SRC = os.path.abspath("data/source/kerala_relief_camps.xlsx")
FALLBACK_SRC = os.path.abspath("data/kerala_relief_camps.xlsx")

excel_path = PRIMARY_SRC if os.path.exists(PRIMARY_SRC) else FALLBACK_SRC
if not os.path.exists(excel_path):
    raise FileNotFoundError(f"Relief camps workbook not found at {PRIMARY_SRC} or {FALLBACK_SRC}")

print(f"[1/6] Loading workbook: {excel_path}")
wb = openpyxl.load_workbook(excel_path, read_only=True)
sheet_names = wb.sheetnames
print(f"      Sheets found: {sheet_names}")

main_sheet = "All Kerala " if "All Kerala " in sheet_names else sheet_names[0]
df_raw = pd.read_excel(excel_path, sheet_name=main_sheet)
total_raw = len(df_raw)
print(f"      Loaded sheet '{main_sheet}' with {total_raw} rows.")

# Extract metadata
meta = {
    "source_file": os.path.basename(excel_path),
    "source_sheet": main_sheet,
    "source_creator": "FaheedGISseoc@outlook.com",
    "source_created_date": "2020-08-05T16:04:01",
    "source_modified_date": "2020-08-05T16:52:57",
    "source_agency": "Kerala State Emergency Operations Centre (SEOC GIS Cell)",
    "cleaned_at": datetime.utcnow().isoformat() + "Z",
    "total_source_records": total_raw
}

# District normalization map to match ResQNet KERALA_DISTRICTS
DISTRICT_ID_MAP = {
    "Thiruvananthapuram": "thiruvananthapuram",
    "Kollam": "kollam",
    "Pathanamthitta": "pathanamthitta",
    "Alappuzha": "alappuzha",
    "Kottayam": "kottayam",
    "Idukki": "idukki",
    "Ernakulam": "ernakulam",
    "Thrissur": "thrissur",
    "Palakkad": "palakkad",
    "Malappuram": "malappuram",
    "Kozhikode": "kozhikode",
    "Wayanad": "wayanad",
    "Kannur": "kannur",
    "Kasaragod": "kasaragod"
}

print("[2/6] Cleaning and parsing records...")

all_records = []
mapped_records = []
unmapped_records = []
swapped_records = []

# Bounds for Kerala: Lat [8.0, 13.0], Lng [74.5, 77.8]
LAT_MIN, LAT_MAX = 8.0, 13.0
LNG_MIN, LNG_MAX = 74.5, 77.8

def safe_float(v):
    if pd.isna(v):
        return None
    try:
        s = str(v).strip().replace(',', '')
        val = float(s)
        return val if not np.isnan(val) else None
    except:
        return None

def safe_str(v):
    if pd.isna(v):
        return None
    s = str(v).strip()
    return s if s else None

for idx, row in df_raw.iterrows():
    sl_no = int(row.get("Sl.No", idx + 1))
    raw_dist = safe_str(row.get("District"))
    dist_id = DISTRICT_ID_MAP.get(raw_dist, raw_dist.lower() if raw_dist else "unknown")
    
    camp_name = safe_str(row.get("Camp"))
    if not camp_name:
        camp_name = f"[Unnamed Facility Sl.No {sl_no}]"
        
    ownership = safe_str(row.get("Ownership"))
    lsg = safe_str(row.get("LSG"))
    village = safe_str(row.get("Village"))
    fac_type = safe_str(row.get("Type"))
    
    # Capacity
    raw_cap = row.get("Capacity")
    cap_int = None
    if pd.notna(raw_cap):
        try:
            cap_int = int(float(str(raw_cap).strip().replace(',', '')))
        except:
            cap_int = None
            
    rooms = safe_str(row.get("Rooms"))
    toilets = safe_str(row.get("Toilets"))
    disabled_friendly = safe_str(row.get("DisabledFriendly"))
    
    # Coordinates: Y is Latitude, X is Longitude
    raw_y = row.get("Y")
    raw_x = row.get("X")
    y_float = safe_float(raw_y)
    x_float = safe_float(raw_x)
    
    coord_status = "UNKNOWN"
    lat = None
    lng = None
    swapped = False
    exclusion_reason = None
    
    if y_float is None or x_float is None:
        coord_status = "MISSING_COORDINATES"
        exclusion_reason = "Missing or non-numeric coordinate values in source workbook"
    elif LAT_MIN <= y_float <= LAT_MAX and LNG_MIN <= x_float <= LNG_MAX:
        # Standard valid coordinates
        coord_status = "VALID"
        lat = round(y_float, 6)
        lng = round(x_float, 6)
    elif LNG_MIN <= y_float <= LNG_MAX and LAT_MIN <= x_float <= LAT_MAX:
        # Inverted coordinates: operator placed Longitude in Y and Latitude in X
        coord_status = "SWAPPED_XY"
        lat = round(x_float, 6)
        lng = round(y_float, 6)
        swapped = True
        exclusion_reason = "Source operator inverted X and Y; corrected based on geographic Kerala coordinate bounds"
    else:
        coord_status = "OUT_OF_BOUNDS"
        if y_float == x_float:
            exclusion_reason = f"Duplicate identical coordinates (lat={y_float}, lng={x_float})"
        elif y_float == 0.0 or x_float == 0.0:
            exclusion_reason = "Zero coordinate placeholder (0.0, 0.0)"
        else:
            exclusion_reason = f"Coordinates ({y_float}, {x_float}) outside realistic Kerala bounds (Lat [{LAT_MIN}, {LAT_MAX}], Lng [{LNG_MIN}, {LNG_MAX}])"

    record = {
        "id": f"kl_camp_{sl_no:05d}",
        "sl_no": sl_no,
        "district_id": dist_id,
        "district_name": raw_dist,
        "name": camp_name,
        "ownership": ownership,
        "lsg": lsg,
        "village": village,
        "facility_type": fac_type,
        "capacity_persons": cap_int,
        "rooms": rooms,
        "toilets": toilets,
        "disabled_friendly": disabled_friendly,
        "latitude": lat,
        "longitude": lng,
        "coordinate_status": coord_status,
        "coordinates_swapped": swapped,
        "source_y": str(raw_y) if pd.notna(raw_y) else None,
        "source_x": str(raw_x) if pd.notna(raw_x) else None,
        # Operational and provenance disclaimers
        "source_date": "2020-08-05",
        "facility_status": "DESIGNATED_POTENTIAL_FACILITY",
        "is_verified_operational_2026": False,
        "official_verification_status": "HISTORICAL_REGISTRY_UNVERIFIED",
        "status_notice": "Historical 2020 SEOC facility registry. Not confirmed currently operational or staffed. Contact local Taluk Control Room (1077 / 112) for active emergency shelter orders."
    }
    
    all_records.append(record)
    
    if lat is not None and lng is not None:
        mapped_records.append(record)
        if swapped:
            swapped_records.append(record)
    else:
        unmapped_record = dict(record)
        unmapped_record["exclusion_reason"] = exclusion_reason
        unmapped_records.append(unmapped_record)

print(f"[3/6] Cleaned record counts:")
print(f"      Total records: {len(all_records)}")
print(f"      Mapped records (usable coords): {len(mapped_records)} (including {len(swapped_records)} corrected swapped coords)")
print(f"      Unmapped records (excluded from map): {len(unmapped_records)}")

# District distribution
dist_summary = {}
for r in mapped_records:
    d = r["district_name"]
    dist_summary[d] = dist_summary.get(d, 0) + 1

print("\n--- District Distribution of Mapped Facilities ---")
for d, count in sorted(dist_summary.items(), key=lambda x: -x[1]):
    print(f"      {d:<20}: {count:>4} safe spots")

# Create output directories
os.makedirs("data/cleaned", exist_ok=True)
os.makedirs("frontend/public/data", exist_ok=True)
os.makedirs("frontend/src/data", exist_ok=True)

# 1. Full cleaned JSON (all 6,377 records)
full_out_path = "data/cleaned/kerala_relief_camps_all.json"
with open(full_out_path, "w", encoding="utf-8") as f:
    json.dump({"metadata": meta, "records": all_records}, f, indent=2)
print(f"[4/6] Saved complete dataset to {full_out_path}")

# 2. Mapped JSON (6,001 records with coordinates)
mapped_out_path = "data/cleaned/kerala_relief_camps_mapped.json"
with open(mapped_out_path, "w", encoding="utf-8") as f:
    json.dump({"metadata": meta, "count": len(mapped_records), "records": mapped_records}, f, indent=2)
print(f"      Saved mapped dataset to {mapped_out_path}")

# 3. Compact Frontend JSON for fast client loading & offline storage
frontend_compact_records = [
    {
        "id": r["id"],
        "sl": r["sl_no"],
        "d_id": r["district_id"],
        "d_name": r["district_name"],
        "name": r["name"],
        "lat": r["latitude"],
        "lng": r["longitude"],
        "cap": r["capacity_persons"],
        "type": r["facility_type"],
        "own": r["ownership"],
        "lsg": r["lsg"],
        "vil": r["village"],
        "swp": r["coordinates_swapped"]
    }
    for r in mapped_records
]

frontend_json_path = "frontend/public/data/kerala_relief_camps.json"
with open(frontend_json_path, "w", encoding="utf-8") as f:
    json.dump({
        "metadata": {
            "source_agency": meta["source_agency"],
            "source_date": meta["source_created_date"],
            "total_facilities": len(mapped_records),
            "unmapped_facilities": len(unmapped_records),
            "total_raw_records": total_raw,
            "disclaimer": "Historical 2020 SEOC facility listing. Not confirmed currently operational."
        },
        "facilities": frontend_compact_records
    }, f)
print(f"      Saved frontend static bundle to {frontend_json_path} ({os.path.getsize(frontend_json_path)} bytes)")

# Summary for frontend offline bundling
frontend_summary_path = "frontend/src/data/relief_camps_meta.json"
with open(frontend_summary_path, "w", encoding="utf-8") as f:
    json.dump({
        "metadata": meta,
        "counts": {
            "total_raw": total_raw,
            "mapped": len(mapped_records),
            "unmapped": len(unmapped_records),
            "swapped_corrected": len(swapped_records)
        },
        "district_distribution": dist_summary
    }, f, indent=2)
print(f"      Saved metadata summary to {frontend_summary_path}")

# 4. Generate Unmapped Records Review Report (JSON + Markdown)
review_json_path = "data/cleaned/relief_camps_review_report.json"
with open(review_json_path, "w", encoding="utf-8") as f:
    json.dump({
        "metadata": meta,
        "unmapped_count": len(unmapped_records),
        "unmapped_records": unmapped_records
    }, f, indent=2)

report_md_path = "data/cleaned/relief_camps_review_report.md"
with open(report_md_path, "w", encoding="utf-8") as f:
    f.write("# Kerala Relief Camps: Unmapped Records & Coordinate Anomaly Audit Report\n\n")
    f.write(f"- **Source File**: `{meta['source_file']}` (Sheet: `{meta['source_sheet']}`)\n")
    f.write(f"- **Compiled By**: `{meta['source_creator']}` ({meta['source_agency']})\n")
    f.write(f"- **Source Date**: `{meta['source_created_date']}`\n")
    f.write(f"- **Audit Timestamp**: `{meta['cleaned_at']}`\n\n")
    f.write("## 1. Executive Summary\n\n")
    f.write(f"| Metric | Count | Percentage |\n")
    f.write(f"| :--- | :--- | :--- |\n")
    f.write(f"| **Total Raw Source Rows** | {total_raw} | 100.0% |\n")
    f.write(f"| **Usable Mapped Safe-Spots** | {len(mapped_records)} | {len(mapped_records)/total_raw*100:.2f}% |\n")
    f.write(f"| **- Direct Valid Coordinates** | {len(mapped_records)-len(swapped_records)} | {(len(mapped_records)-len(swapped_records))/total_raw*100:.2f}% |\n")
    f.write(f"| **- Swapped X/Y Coordinates Corrected** | {len(swapped_records)} | {len(swapped_records)/total_raw*100:.2f}% |\n")
    f.write(f"| **Excluded from Mapping (Review Required)** | {len(unmapped_records)} | {len(unmapped_records)/total_raw*100:.2f}% |\n")
    f.write(f"| **- Missing / Non-Numeric Coordinates** | {sum(1 for r in unmapped_records if r['coordinate_status'] == 'MISSING_COORDINATES')} | {sum(1 for r in unmapped_records if r['coordinate_status'] == 'MISSING_COORDINATES')/total_raw*100:.2f}% |\n")
    f.write(f"| **- Out-of-Bounds / Identical Lat-Lng / Zero Coordinates** | {sum(1 for r in unmapped_records if r['coordinate_status'] == 'OUT_OF_BOUNDS')} | {sum(1 for r in unmapped_records if r['coordinate_status'] == 'OUT_OF_BOUNDS')/total_raw*100:.2f}% |\n\n")
    
    f.write("## 2. Swapped Coordinate Records (Corrected with Provenance Flag)\n\n")
    f.write("The following 3 facilities had Latitude entered in column X and Longitude entered in column Y. They were corrected based on Kerala geographic bounding constraints and flagged with `coordinates_swapped: true`:\n\n")
    f.write("| Sl.No | District | Facility Name | Source Y (Lng) | Source X (Lat) | Corrected Lat | Corrected Lng |\n")
    f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
    for r in swapped_records:
        f.write(f"| {r['sl_no']} | {r['district_name']} | {r['name']} | {r['source_y']} | {r['source_x']} | {r['latitude']} | {r['longitude']} |\n")
    f.write("\n")

    f.write("## 3. Excluded Records Audit Trail (Sample of 50 Out of Bounds / Missing)\n\n")
    f.write("| Sl.No | District | Village / LSG | Facility Name | Source Y | Source X | Audit Issue |\n")
    f.write("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n")
    for r in unmapped_records[:50]:
        f.write(f"| {r['sl_no']} | {r['district_name']} | {r['village'] or r['lsg'] or '-'} | {r['name']} | {r['source_y'] or 'null'} | {r['source_x'] or 'null'} | {r['exclusion_reason']} |\n")
    f.write("\n*(Full list of all 376 excluded records is available in `relief_camps_review_report.json`)*\n")

print(f"[5/6] Generated review report at {report_md_path} and {review_json_path}")
print("[6/6] Data cleaning complete.")
