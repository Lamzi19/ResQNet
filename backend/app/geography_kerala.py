"""
Centralized Kerala Geography Configuration for ResQNet.

Contains all 14 official revenue districts of Kerala, India, with verified
geographic coordinates, average elevation, primary river basins, terrain classification,
CWC river gauge references, and coastal proximity attributes.

Districts and river basins are maintained as distinct relational entities to avoid
geographical conflation (e.g. Periyar basin spans Ernakulam and Idukki, not just one district).
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class RiverBasinInfo(BaseModel):
    id: str
    name: str
    origin: str
    drainage_area_sqkm: float
    major_dams: List[str]
    cwc_gauge_stations: List[str]
    flooding_characteristics: str


class CoastalStationInfo(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    port_type: str
    benchmark_m_cd: float  # Chart Datum mean sea level offset
    tidal_range_spring_m: float
    compound_hazard_type: str


class KeralaDistrictConfig(BaseModel):
    id: str
    name: str
    malayalam_name: str
    latitude: float
    longitude: float
    elevation_m: float
    terrain_type: str  # "COASTAL", "MIDLAND", "HIGHLAND_GHATS", "LOWLAND_KUTTANAD"
    is_coastal: bool
    primary_river_basins: List[str]
    key_monitoring_station: str
    cwc_gauge_reference: Optional[str] = None
    river_warning_threshold_m3s: Optional[float] = None
    river_danger_threshold_m3s: Optional[float] = None
    historical_vulnerability: str
    data_coverage_status: str  # "FULL_MULTI_FACTOR", "RIVERINE_AND_WEATHER", "WEATHER_AND_SOIL"


# 1. Primary River Basins of Kerala (distinct from district boundaries)
KERALA_RIVER_BASINS: Dict[str, RiverBasinInfo] = {
    "periyar": RiverBasinInfo(
        id="periyar",
        name="Periyar River Basin",
        origin="Sivagiri Hills, Western Ghats",
        drainage_area_sqkm=5398.0,
        major_dams=["Idukki Arch Dam", "Mullaperiyar", "Cheruthoni", "Idamalayar", "Bhoothathankettu"],
        cwc_gauge_stations=["Kalady", "Neeleswaram", "Vandiperiyar"],
        flooding_characteristics="Main flood corridor of Central Kerala; sudden dam gate releases trigger severe riverine and urban backwater flooding in Ernakulam and Idukki."
    ),
    "pamba": RiverBasinInfo(
        id="pamba",
        name="Pamba River Basin",
        origin="Peermedu Plateau",
        drainage_area_sqkm=2235.0,
        major_dams=["Pamba Reservoir", "Kakki Dam", "Anathode Dam"],
        cwc_gauge_stations=["Chengannur", "Malakkara", "Kallooppara"],
        flooding_characteristics="Holy river corridor prone to severe inundation at Ranni, Kozhencherry, and deltaic drainage congestion into Kuttanad/Vembanad Lake."
    ),
    "bharathappuzha": RiverBasinInfo(
        id="bharathappuzha",
        name="Bharathappuzha (Nila)",
        origin="Anamalai Hills",
        drainage_area_sqkm=6186.0,
        major_dams=["Malampuzha Dam", "Pothundi", "Walayar", "Mangalam"],
        cwc_gauge_stations=["Kumbidi", "Palakkad", "Pattambi"],
        flooding_characteristics="Longest river in Kerala; large catchment basin crossing the Palakkad Gap; river overflow affects Palakkad and Malappuram plains."
    ),
    "chalakudy": RiverBasinInfo(
        id="chalakudy",
        name="Chalakudy River Basin",
        origin="Anamalai Hills",
        drainage_area_sqkm=1704.0,
        major_dams=["Sholayar Dam", "Poringalkuthu Dam"],
        cwc_gauge_stations=["Arangali", "Chalakudy"],
        flooding_characteristics="Steep gorge descent; Poringalkuthu dam overflow causes rapid riverine flash flooding inundating Chalakudy town and NH 544."
    ),
    "chaliyar": RiverBasinInfo(
        id="chaliyar",
        name="Chaliyar River Basin",
        origin="Ilambaleri Hills, Wayanad/Nilgiris",
        drainage_area_sqkm=2923.0,
        major_dams=["No major large reservoirs; unregulated rapid natural run-off"],
        cwc_gauge_stations=["Kuniyil", "Feroke"],
        flooding_characteristics="Fast flash flood response following cloudbursts in Nilambur forest valley; submerges Nilambur, Feroke, and Calicut lowlands."
    ),
    "meenachil": RiverBasinInfo(
        id="meenachil",
        name="Meenachil River Basin",
        origin="Araikunnumudi, Western Ghats",
        drainage_area_sqkm=1272.0,
        major_dams=[],
        cwc_gauge_stations=["Kidangoor", "Pala"],
        flooding_characteristics="Originates in rubber hills of Kottayam; severe flash flooding in Pala and Erattupetta; discharges into eastern Vembanad Lake."
    ),
    "achankovil": RiverBasinInfo(
        id="achankovil",
        name="Achankovil River Basin",
        origin="Pasukida Mettu",
        drainage_area_sqkm=1484.0,
        major_dams=[],
        cwc_gauge_stations=["Mavelikkara", "Thumpamon"],
        flooding_characteristics="Traverses Pathanamthitta and Alappuzha; combines with Pamba in Upper Kuttanad causing widespread prolonged waterlogging."
    ),
    "kabini": RiverBasinInfo(
        id="kabini",
        name="Kabini (Kapila) River Basin",
        origin="Wayanad Hills (East-flowing to Cauvery)",
        drainage_area_sqkm=2140.0,
        major_dams=["Banasura Sagar Dam", "Karapuzha Dam"],
        cwc_gauge_stations=["Muthankera", "Bavali"],
        flooding_characteristics="High-altitude plateau basin; extreme rainfall triggers simultaneous landslides and valley floor inundation in Wayanad."
    ),
    "karamana": RiverBasinInfo(
        id="karamana",
        name="Karamana River Basin",
        origin="Agasthyamala Peaks",
        drainage_area_sqkm=702.0,
        major_dams=["Peppara Dam", "Aruvikkara Dam"],
        cwc_gauge_stations=["Mangalathu Kadavu", "Thiruvananthapuram"],
        flooding_characteristics="Urban river corridor through Thiruvananthapuram city; prone to drainage waterlogging when Aruvikkara sluices open."
    )
}

# 2. Coastal Marine & Tidal Monitoring Points (Port Benchmarks)
KERALA_COASTAL_STATIONS: Dict[str, CoastalStationInfo] = {
    "cochin_port": CoastalStationInfo(
        id="cochin_port",
        name="Cochin Port / Ernakulam Channel",
        latitude=9.9667,
        longitude=76.2667,
        port_type="Major Seaport / Estuary Mouth",
        benchmark_m_cd=1.05,
        tidal_range_spring_m=1.18,
        compound_hazard_type="Backwater drainage choke: High tide retards Periyar and Muvattupuzha outflow into the Arabian Sea."
    ),
    "alappuzha_coast": CoastalStationInfo(
        id="alappuzha_coast",
        name="Alappuzha Coast / Thottappally Spillway",
        latitude=9.3214,
        longitude=76.3842,
        port_type="Minor Port / Spillway Channel",
        benchmark_m_cd=0.98,
        tidal_range_spring_m=1.05,
        compound_hazard_type="Thottappally floodway sandbar formation + tidal obstruction prevents Kuttanad delta evacuation."
    ),
    "kozhikode_beypore": CoastalStationInfo(
        id="kozhikode_beypore",
        name="Beypore Port / Chaliyar Estuary",
        latitude=11.1667,
        longitude=75.8000,
        port_type="Intermediate Port / River Mouth",
        benchmark_m_cd=1.12,
        tidal_range_spring_m=1.35,
        compound_hazard_type="Chaliyar river monsoon flood meets rough Arabian Sea waves, inundating Beypore and Kadalundi coastal pockets."
    ),
    "vizhinjam": CoastalStationInfo(
        id="vizhinjam",
        name="Vizhinjam International Seaport",
        latitude=8.3753,
        longitude=76.9912,
        port_type="Deepwater Port",
        benchmark_m_cd=0.92,
        tidal_range_spring_m=0.98,
        compound_hazard_type="Open ocean wave swells and coastal sea erosion during South-West monsoon storms."
    )
}

# 3. All 14 Official Revenue Districts of Kerala
KERALA_DISTRICTS: Dict[str, KeralaDistrictConfig] = {
    "ernakulam": KeralaDistrictConfig(
        id="ernakulam",
        name="Ernakulam",
        malayalam_name="എറണാകുളം",
        latitude=9.9816,
        longitude=76.2999,
        elevation_m=4.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["periyar", "chalakudy"],
        key_monitoring_station="Kalady / Aluva (Periyar)",
        cwc_gauge_reference="Kalady (CWC) - Warning 7.5m, Danger 8.5m",
        river_warning_threshold_m3s=850.0,
        river_danger_threshold_m3s=1400.0,
        historical_vulnerability="Commercial hub severely impacted during 2018 deluge; Aluva, Paravur, Kalamassery flooded due to Periyar overflow and Cochin tidal backflow.",
        data_coverage_status="FULL_MULTI_FACTOR"
    ),
    "alappuzha": KeralaDistrictConfig(
        id="alappuzha",
        name="Alappuzha",
        malayalam_name="ആലപ്പുഴ",
        latitude=9.4981,
        longitude=76.3388,
        elevation_m=1.0,
        terrain_type="LOWLAND_KUTTANAD",
        is_coastal=True,
        primary_river_basins=["pamba", "achankovil", "meenachil"],
        key_monitoring_station="Chengannur / Thottappally (Kuttanad)",
        cwc_gauge_reference="Chengannur (CWC) - Warning 6.0m, Danger 7.0m",
        river_warning_threshold_m3s=600.0,
        river_danger_threshold_m3s=1050.0,
        historical_vulnerability="India's lowest elevation agricultural basin (0.5 to 2.5m below sea level). Deltaic receiving basin for 4 major rivers; prolonged submergence.",
        data_coverage_status="FULL_MULTI_FACTOR"
    ),
    "thrissur": KeralaDistrictConfig(
        id="thrissur",
        name="Thrissur",
        malayalam_name="തൃശ്ശൂർ",
        latitude=10.5276,
        longitude=76.2144,
        elevation_m=12.0,
        terrain_type="MIDLAND",
        is_coastal=True,
        primary_river_basins=["chalakudy", "karuvannur"],
        key_monitoring_station="Arangali / Chalakudy Bridge",
        cwc_gauge_reference="Arangali (CWC) - Warning 7.1m, Danger 8.0m",
        river_warning_threshold_m3s=550.0,
        river_danger_threshold_m3s=900.0,
        historical_vulnerability="Chalakudy river overflow submerged NH 544 and adjacent townships in 2018; Kole wetlands provide natural flood buffer but suffer long inundation.",
        data_coverage_status="FULL_MULTI_FACTOR"
    ),
    "pathanamthitta": KeralaDistrictConfig(
        id="pathanamthitta",
        name="Pathanamthitta",
        malayalam_name="പത്തനംതിട്ട",
        latitude=9.2648,
        longitude=76.7870,
        elevation_m=31.0,
        terrain_type="MIDLAND",
        is_coastal=False,
        primary_river_basins=["pamba", "achankovil"],
        key_monitoring_station="Malakkara / Kozhencherry",
        cwc_gauge_reference="Malakkara (CWC) - Warning 8.2m, Danger 9.2m",
        river_warning_threshold_m3s=500.0,
        river_danger_threshold_m3s=850.0,
        historical_vulnerability="Upper Pamba basin epicentre during August 2018; Ranni and Kozhencherry townships submerged up to first floors within 12 hours.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "idukki": KeralaDistrictConfig(
        id="idukki",
        name="Idukki",
        malayalam_name="ഇടുക്കി",
        latitude=9.8494,
        longitude=76.9810,
        elevation_m=950.0,
        terrain_type="HIGHLAND_GHATS",
        is_coastal=False,
        primary_river_basins=["periyar"],
        key_monitoring_station="Vandiperiyar / Cheruthoni",
        cwc_gauge_reference="Vandiperiyar (CWC) - Warning 792.5m, Danger 794.0m",
        river_warning_threshold_m3s=700.0,
        river_danger_threshold_m3s=1200.0,
        historical_vulnerability="Highland reservoir hub; steep slope flash floods, debris flows, and Pettimudi (2020) landslide hazards; major source of downstream Periyar flood discharge.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "wayanad": KeralaDistrictConfig(
        id="wayanad",
        name="Wayanad",
        malayalam_name="വയനാട്",
        latitude=11.6854,
        longitude=76.1320,
        elevation_m=750.0,
        terrain_type="HIGHLAND_GHATS",
        is_coastal=False,
        primary_river_basins=["kabini"],
        key_monitoring_station="Muthankera / Mananthavady",
        cwc_gauge_reference="Muthankera (CWC) - Warning 11.5m, Danger 12.5m",
        river_warning_threshold_m3s=380.0,
        river_danger_threshold_m3s=620.0,
        historical_vulnerability="Extreme rainfall triggers severe debris flows (Chooralmala/Meppadi July 2024, Puthumala 2019) and Banasura Sagar dam backwater flooding.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "kozhikode": KeralaDistrictConfig(
        id="kozhikode",
        name="Kozhikode",
        malayalam_name="കോഴിക്കോട്",
        latitude=11.2588,
        longitude=75.7804,
        elevation_m=8.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["chaliyar"],
        key_monitoring_station="Kuniyil / Feroke (Chaliyar)",
        cwc_gauge_reference="Kuniyil (CWC) - Warning 7.5m, Danger 8.5m",
        river_warning_threshold_m3s=480.0,
        river_danger_threshold_m3s=800.0,
        historical_vulnerability="Chaliyar river overflow isolates Mavoor and Feroke; urban stormwater congestion in Kozhikode city center (Mavoor Road).",
        data_coverage_status="FULL_MULTI_FACTOR"
    ),
    "malappuram": KeralaDistrictConfig(
        id="malappuram",
        name="Malappuram",
        malayalam_name="മലപ്പുറം",
        latitude=11.0510,
        longitude=76.0711,
        elevation_m=35.0,
        terrain_type="MIDLAND",
        is_coastal=True,
        primary_river_basins=["chaliyar", "bharathappuzha"],
        key_monitoring_station="Nilambur / Tirur",
        cwc_gauge_reference="Nilambur (CWC) - Warning 8.0m, Danger 9.0m",
        river_warning_threshold_m3s=520.0,
        river_danger_threshold_m3s=880.0,
        historical_vulnerability="Nilambur valley flash floods and Kavalappara (2019) landslide disaster; coastal waterlogging in Ponnani during high swells.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "kottayam": KeralaDistrictConfig(
        id="kottayam",
        name="Kottayam",
        malayalam_name="കോട്ടയം",
        latitude=9.5916,
        longitude=76.5222,
        elevation_m=20.0,
        terrain_type="MIDLAND",
        is_coastal=False,
        primary_river_basins=["meenachil"],
        key_monitoring_station="Kidangoor / Pala (Meenachil)",
        cwc_gauge_reference="Kidangoor (CWC) - Warning 7.8m, Danger 8.8m",
        river_warning_threshold_m3s=340.0,
        river_danger_threshold_m3s=580.0,
        historical_vulnerability="Flash flooding in Pala and eastern high ranges (Koottickal cloudburst 2021); western lowlands experience backwater stagnation from Vembanad.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "palakkad": KeralaDistrictConfig(
        id="palakkad",
        name="Palakkad",
        malayalam_name="പാലക്കാട്",
        latitude=10.7867,
        longitude=76.6548,
        elevation_m=84.0,
        terrain_type="MIDLAND",
        is_coastal=False,
        primary_river_basins=["bharathappuzha"],
        key_monitoring_station="Kumbidi / Malampuzha",
        cwc_gauge_reference="Kumbidi (CWC) - Warning 10.0m, Danger 11.2m",
        river_warning_threshold_m3s=450.0,
        river_danger_threshold_m3s=750.0,
        historical_vulnerability="Malampuzha reservoir discharges cause Bharathappuzha riverbanks to flood; agricultural inundation in Chittur and Pattambi.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "kannur": KeralaDistrictConfig(
        id="kannur",
        name="Kannur",
        malayalam_name="കണ്ണൂർ",
        latitude=11.8745,
        longitude=75.3704,
        elevation_m=16.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["valapattanam"],
        key_monitoring_station="Valapattanam Bridge",
        cwc_gauge_reference="Valapattanam (CWC) - Warning 4.5m, Danger 5.5m",
        river_warning_threshold_m3s=380.0,
        river_danger_threshold_m3s=650.0,
        historical_vulnerability="Valapattanam and Kuppam river overflows affect Iritty and Taliparamba; coastal sea surges in Thalassery and Payyambalam.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "kasaragod": KeralaDistrictConfig(
        id="kasaragod",
        name="Kasaragod",
        malayalam_name="കാസർഗോഡ്",
        latitude=12.5102,
        longitude=74.9852,
        elevation_m=19.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["chandragiri"],
        key_monitoring_station="Thekkil / Chandragiri Bridge",
        cwc_gauge_reference="Thekkil (CWC) - Warning 5.5m, Danger 6.5m",
        river_warning_threshold_m3s=350.0,
        river_danger_threshold_m3s=600.0,
        historical_vulnerability="Chandragiri and Kariangode rivers swell during monsoon downpours; coastal river mouths experience tidal backwater accumulation.",
        data_coverage_status="RIVERINE_AND_WEATHER"
    ),
    "kollam": KeralaDistrictConfig(
        id="kollam",
        name="Kollam",
        malayalam_name="കൊല്ലം",
        latitude=8.8932,
        longitude=76.6141,
        elevation_m=15.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["kallada"],
        key_monitoring_station="Punalur / Kallada",
        cwc_gauge_reference="Punalur (CWC) - Warning 7.0m, Danger 8.0m",
        river_warning_threshold_m3s=320.0,
        river_danger_threshold_m3s=540.0,
        historical_vulnerability="Thenmala dam sluice openings swell Kallada river inundating Punalur and Enathu; Ashtamudi estuary lowlands flood during high tides.",
        data_coverage_status="WEATHER_AND_SOIL"
    ),
    "thiruvananthapuram": KeralaDistrictConfig(
        id="thiruvananthapuram",
        name="Thiruvananthapuram",
        malayalam_name="തിരുവനന്തപുരം",
        latitude=8.5241,
        longitude=76.9366,
        elevation_m=18.0,
        terrain_type="COASTAL",
        is_coastal=True,
        primary_river_basins=["karamana"],
        key_monitoring_station="Aruvikkara / Mangalathu Kadavu",
        cwc_gauge_reference="Mangalathu Kadavu (CWC) - Warning 6.5m, Danger 7.5m",
        river_warning_threshold_m3s=280.0,
        river_danger_threshold_m3s=480.0,
        historical_vulnerability="State capital urban center prone to rapid stormwater flash flooding (Thampanoor, Pazhavangadi) when rainfall exceeds 70mm/3hr.",
        data_coverage_status="WEATHER_AND_SOIL"
    )
}

# Verified GeoJSON boundaries / approximate bounding polygons for the 14 districts of Kerala
# to render accurate choropleth and district outline vectors on Leaflet map
KERALA_DISTRICT_BOUNDS: Dict[str, List[List[float]]] = {
    "kasaragod": [[12.18, 74.85], [12.75, 74.85], [12.75, 75.35], [12.18, 75.35]],
    "kannur": [[11.65, 75.15], [12.20, 75.15], [12.20, 75.95], [11.65, 75.95]],
    "wayanad": [[11.45, 75.80], [11.95, 75.80], [11.95, 76.45], [11.45, 76.45]],
    "kozhikode": [[11.10, 75.50], [11.70, 75.50], [11.70, 76.10], [11.10, 76.10]],
    "malappuram": [[10.65, 75.75], [11.35, 75.75], [11.35, 76.50], [10.65, 76.50]],
    "palakkad": [[10.35, 76.20], [11.20, 76.20], [11.20, 76.95], [10.35, 76.95]],
    "thrissur": [[10.15, 75.95], [10.75, 75.95], [10.75, 76.65], [10.15, 76.65]],
    "ernakulam": [[9.75, 76.15], [10.30, 76.15], [10.30, 76.85], [9.75, 76.85]],
    "idukki": [[9.25, 76.65], [10.35, 76.65], [10.35, 77.40], [9.25, 77.40]],
    "kottayam": [[9.35, 76.35], [9.90, 76.35], [9.90, 76.95], [9.35, 76.95]],
    "alappuzha": [[9.05, 76.25], [9.85, 76.25], [9.85, 76.65], [9.05, 76.65]],
    "pathanamthitta": [[9.05, 76.50], [9.55, 76.50], [9.55, 77.25], [9.05, 77.25]],
    "kollam": [[8.70, 76.45], [9.25, 76.45], [9.25, 77.25], [8.70, 77.25]],
    "thiruvananthapuram": [[8.28, 76.65], [8.90, 76.65], [8.90, 77.30], [8.28, 77.30]]
}
