"""
Inspection script for kerala_relief_camps.xlsx
Analyzes sheets, columns, row counts, data quality, district distributions,
and coordinate validity.
"""
import os
import pandas as pd
import numpy as np

excel_path = os.path.abspath('data/source/kerala_relief_camps.xlsx')
if not os.path.exists(excel_path):
    excel_path = os.path.abspath('data/kerala_relief_camps.xlsx')

print(f"Reading workbook: {excel_path}")
xl = pd.ExcelFile(excel_path)
print(f"Sheet names: {xl.sheet_names}")

for sheet_name in xl.sheet_names:
    df_sheet = xl.parse(sheet_name)
    print(f"\n--- Sheet: '{sheet_name}' ---")
    print(f"Dimensions: {df_sheet.shape[0]} rows x {df_sheet.shape[1]} columns")
    print(f"Columns: {list(df_sheet.columns)}")
    if len(df_sheet) > 0:
        print("Sample row:")
        print(df_sheet.head(1).to_dict(orient='records'))

main_sheet = 'All Kerala ' if 'All Kerala ' in xl.sheet_names else xl.sheet_names[0]
df = xl.parse(main_sheet)

print("\n================ DATA QUALITY SUMMARY ================")
print(f"Total raw rows: {len(df)}")
print("\nColumn Null Counts:")
print(df.isnull().sum())

print("\n--- Raw District Value Counts ---")
print(df['District'].value_counts(dropna=False))

# Function to clean and parse float
def to_float(val):
    if pd.isna(val):
        return None
    try:
        # handle commas or spaces if any
        s = str(val).strip().replace(',', '')
        return float(s)
    except:
        return None

df['lat_parsed'] = df['Y'].apply(to_float)
df['lng_parsed'] = df['X'].apply(to_float)

has_both_coords = df['lat_parsed'].notna() & df['lng_parsed'].notna()
print(f"\nRows with both numeric coordinates: {has_both_coords.sum()} / {len(df)}")

# Geographic bounds for Kerala: Lat [8.0, 13.0], Lng [74.5, 77.8]
normal_kerala = (
    (df['lat_parsed'] >= 8.0) & (df['lat_parsed'] <= 13.0) &
    (df['lng_parsed'] >= 74.5) & (df['lng_parsed'] <= 77.8)
)
print(f"Coordinates in normal Kerala bounds (Lat [8, 13], Lng [74.5, 77.8]): {normal_kerala.sum()}")

# Inverted coordinates (Lat in X, Lng in Y)
inverted = (
    (df['lng_parsed'] >= 8.0) & (df['lng_parsed'] <= 13.0) &
    (df['lat_parsed'] >= 74.5) & (df['lat_parsed'] <= 77.8)
)
print(f"Inverted coordinates (X is Lat, Y is Lng): {inverted.sum()}")

# Coordinates outside bounds entirely
out_of_bounds = has_both_coords & (~normal_kerala) & (~inverted)
print(f"Out of bounds coordinates: {out_of_bounds.sum()}")
if out_of_bounds.sum() > 0:
    print(df[out_of_bounds][['Sl.No', 'District', 'Camp', 'Y', 'X']].head(15))

# Null or unparseable coordinates
missing_coords = ~has_both_coords
print(f"Missing or unparseable coordinates: {missing_coords.sum()}")
if missing_coords.sum() > 0:
    print(df[missing_coords][['Sl.No', 'District', 'Camp', 'Y', 'X']].head(15))

# Types and Capacities
print("\n--- Capacity Summary ---")
df['Capacity_numeric'] = pd.to_numeric(df['Capacity'], errors='coerce')
print(f"Valid numeric capacities: {df['Capacity_numeric'].notna().sum()}")
print(f"Null or non-numeric capacities: {df['Capacity_numeric'].isna().sum()}")
print(df['Capacity_numeric'].describe())

print("\n--- Facility Types ---")
print(df['Type'].value_counts(dropna=False))

print("\n--- Ownership ---")
print(df['Ownership'].value_counts(dropna=False))
