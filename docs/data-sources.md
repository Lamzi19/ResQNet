# ResQNet Data Sources & Hydrometeorological Telemetry Inventory

## 1. Overview & Data Ingestion Strategy

ResQNet aggregates multi-domain environmental telemetry spanning atmospheric weather forecasts, deep and surface soil moisture, river discharge hydrology, astronomical coastal tides, and official disaster warning criteria.

All external data ingestion is managed through the backend `WeatherService` with:
- **15-Minute In-Memory TTL Caching**: Eliminates redundant external API requests and prevents rate limiting.
- **Strict Unit Normalization**: Ensures dimensional consistency across legacy models and live visualizers (e.g., precipitation in $mm$, flow rate in $m^3/s$, tide level in meters relative to Chart Datum $m\text{ CD}$).
- **Resilient Fallback Policies**: Automatic failover to historical baseline medians or zero-inflation if third-party endpoints experience network timeouts.

---

## 2. Telemetry Stream Inventory

| Telemetry Stream | Upstream Provider / Model | Geographic Scope | Spatial & Temporal Resolution | Ingestion Mechanism | Update Frequency | Operational Fallback Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Numerical Weather Forecasts (NWP)** | Open-Meteo Global Forecast (ECMWF IFS / GFS seamless ensemble) | Kerala (14 districts) & Coastal Karnataka (5 stations) | $\sim 9\,\text{km}$ grid ($0.1^\circ$), Hourly observations & 48h forecasts | RESTful HTTP JSON (`/v1/forecast`) | 15-minute TTL cache | Forward-fill last valid forecast observation or retain static regional normals. |
| **Precipitation (Past 5-Day Antecedent)** | Open-Meteo Weather API (`past_days=5`) | All 14 Kerala districts & Karnataka stations | Daily sums over preceding 120 hours | RESTful HTTP JSON (`/v1/forecast`) | Ingested per prediction request | Derived using exponential hydrological decay index ($API_t = \sum 0.85^i \cdot P_{d-i}$). |
| **Surface & Root-Zone Soil Moisture** | ECMWF Land Data Assimilation System via Open-Meteo | Volumetric water fraction at $0\text{--}7\,\text{cm}$ and $7\text{--}28\,\text{cm}$ depth | Point query at station coordinates ($m^3/m^3$) | RESTful HTTP JSON (`/v1/forecast`) | 15-minute TTL cache | Porosity saturation clipped at $0.50\,m^3/m^3$; default baseline $0.32\,m^3/m^3$. |
| **River Discharge ($m^3/s$)** | Copernicus Emergency Management Service (GloFAS) via Open-Meteo Flood API | Major river catchments (Periyar, Bharathappuzha, Pamba, Netravati, Gurupura, Swarna) | $\sim 5\,\text{km}$ river network grid ($0.05^\circ$), daily mean flow | RESTful HTTP JSON (`/v1/flood`) | 15-minute TTL cache | Impute regional seasonal median discharge ($45.0\,m^3/s$ default). |
| **Astronomical Tides ($m\text{ CD}$)** | Survey of India / INCOIS Tidal Harmonic Constants | Port of Cochin ($9.9667^\circ\text{N}, 76.2667^\circ\text{E}$) & New Mangalore Port ($12.9141^\circ\text{N}, 74.8000^\circ\text{E}$) | Continuous analytical tide height calculated across 24h cycle | Deterministic Python runtime calculation ($M_2, S_2, K_1, O_1$) | 100% deterministic local calculation (zero network latency) | Pure mathematical calculation; cannot fail or experience downtime. |
| **Marine Waves & Coastal Swell** | Open-Meteo Marine API (ECMWF WAM / GFS Wave) | Arabian Sea coastal stations (Ernakulam, Alappuzha, Kozhikode, Kannur, Kasaragod, Ullal) | $0.25^\circ$ coastal grid, hourly | RESTful HTTP JSON (`/v1/marine`) | 15-minute TTL cache | Set wave height to 0.0m if unavailable (does not block core prediction). |
| **CWC Gauge Warning & Danger Limits** | Central Water Commission (India) | Key hydrological gauge points (Neeleeswaram/Periyar, Kumbidi/Bharathappuzha, Bantwal/Netravati) | Point gauge thresholds (m MSL or $m^3/s$) | Static verified lookup table in `backend/app/geography_kerala.py` | Version-controlled configuration | Static reference; updated upon official CWC gazette publication. |
| **Official Disaster Warning Directives** | India Meteorological Department (IMD) & Kerala State Disaster Management Authority (KSDMA) | State and district-level color codes (Green, Yellow, Orange, Red) | Taluk / District polygons | Ingested via `/api/advisories` (persisted in SQLite) | Operational dispatch / test seeding | Default to Green / Normal background state when no official bulletins are loaded. |

---

## 3. Physical & Derived Metrics Calculation

### A. Antecedent Precipitation Index (API)
Quantifies residual catchment ground wetness over the preceding 5 days using standard hydrologic recession:
$$API_t = \sum_{i=1}^5 (0.85)^i \cdot \text{precip}_{d-i}$$

### B. Soil Saturation Index
Represents the proportion of soil pore space filled with water relative to the estimated field capacity of local laterite/alluvial soils:
$$\text{Soil Saturation} = \text{clip}\left(\frac{\text{SM}_{\text{surface}}}{0.50}, 0.0, 1.0\right)$$

### C. Astronomical Tidal Harmonic Engine
The tide level at hour $t$ (relative to Chart Datum) is synthesized from the dominant diurnal and semi-diurnal constituents:
$$h(t) = H_0 + A_{M_2} \cos(\omega_{M_2} t) + A_{S_2} \cos(\omega_{S_2} t) + A_{K_1} \cos(\omega_{K_1} t) + A_{O_1} \cos(\omega_{O_1} t)$$

- **Cochin Port Benchmarks**: $H_0 = 1.05\,\text{m}$, $A_{M_2} = 0.38\,\text{m}$, $A_{S_2} = 0.16\,\text{m}$, $A_{K_1} = 0.22\,\text{m}$, $A_{O_1} = 0.12\,\text{m}$. Spring tide threshold: tidal range $> 1.05\,\text{m}$.
- **Mangalore Port Benchmarks**: $H_0 = 1.03\,\text{m}$, $A_{M_2} = 0.46\,\text{m}$, $A_{S_2} = 0.19\,\text{m}$, $A_{K_1} = 0.28\,\text{m}$, $A_{O_1} = 0.16\,\text{m}$. Spring tide threshold: tidal range $> 1.20\,\text{m}$.

### D. Coastal Compound Backwater Risk Index
Measures the non-linear compounding effect when high river discharge meets high astronomical ocean tides, preventing gravity drainage:
$$\text{Backwater Risk Index} = \left(\frac{Q_{\text{upstream}}}{Q_{\text{warning}}}\right) \times \left(\frac{H_{\text{tide}}}{1.5}\right)^2$$

---

## 4. Privacy, Security & Data Boundaries

1. **Zero Citizen PII in Telemetry**: All hydrometeorological queries operate solely on static station coordinates or district centroids. No individual user coordinates, IP addresses, or device identifiers are passed to Open-Meteo or GloFAS.
2. **Offline Decoupling**: The future SOS distress beacons and incident logs are completely segregated from the public weather telemetry cache. Distress coordinates are processed locally on the secure backend and never forwarded to external third-party APIs.
3. **Open Access Integrity**: Open-Meteo endpoints require no authenticated API keys, preventing credential leakage in public repositories.
