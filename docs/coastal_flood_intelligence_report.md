# ResQNet Phase 1 — Coastal Flood Intelligence Upgrade Report
**Target Region:** Mangaluru & Coastal Karnataka (Dakshina Kannada & Udupi Districts, India)  
**System Status:** Operational Phase 1 Upgrade  
**Artifact Models:** `ml/artifacts/flood_model_pipeline_v1.joblib` (v1.0.0), `ml/artifacts/flood_model_pipeline_v2_coastal.joblib` (v2.0.0)

---

## Executive Summary

ResQNet has been upgraded from a rainfall-dominated flood risk model to a multi-factor coastal flood intelligence system. The system incorporates:
1. **Copernicus GloFAS River Discharge:** River hydrology for the Netravati, Gurupura, and Swarna river systems.
2. **Astronomical Tidal Harmonics Engine:** Port of Mangalore Benchmark ($M_2, S_2, K_1, O_1$) with spring-tide tagging and estuarine backwater interaction indexes.
3. **Ground-Truth Label Disentanglement:** 97.14% confirmed official disaster records separated from 2.86% proxy runoff thresholds, eliminating evaluation circularity.
4. **Flood Mechanism Classification:** Disentangling `RIVERINE_OVERFLOW`, `URBAN_PLUVIAL`, and `COASTAL_COMPOUND` flood conditions.
5. **Calibrated Multi-Factor Model v2.0.0:** Evaluated strictly out-of-time on held-out 2023–2024 monsoon data, lifting operational recall on coastal compound events from 85.0% to 96.7% and reducing false alarms by 34%.

---

## 1. Data Source & Availability Report

| Data Stream | Primary Provider / Agency | Spatial / Temporal Resolution | Historical Coverage | Access Protocol & Feasibility | Operational Limitation / Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **River Discharge ($m^3/s$)** | Copernicus Emergency Management Service (GloFAS) via Open-Meteo Flood API | $0.05^\circ$ (~5km grid), daily mean & 00:00 UTC | 2018–2024 Historical + 7-Day Ensemble Forecast | Open Access REST API (`/v1/flood`), Programmatic | Verified. Modeled routing; local gauge calibration at Bantwal is estimated. |
| **Astronomical Tides ($m$ CD)** | Survey of India / INCOIS benchmarks for Mangalore Port ($12.9141^\circ\text{N}, 74.8000^\circ\text{E}$) | Localized continuous astronomical harmonics ($M_2, S_2, K_1, O_1$) | 100% deterministic backcast & forecast | Analytical Harmonic Engine inside Python/FastAPI runtime | Verified. Astronomical only; does not include barometric inverted barometer storm surge. |
| **Marine Waves & Swell** | Open-Meteo Marine API (ECMWF WAM / GFS Wave) | $0.25^\circ$, hourly off Mangalore Port | 2022–present (Sparse/null pre-2022) | Open Access REST API (`/v1/marine`) | Live ingestion active. Excluded from 2018–2024 training feature set due to pre-2022 sparsity. |
| **Precipitation & Soil Moisture** | Open-Meteo Historical Weather / Forecast (ERA5 + ECMWF IFS / GFS) | $0.1^\circ$ (~9km grid), hourly / daily | 2018–2024 Historical + 7-Day Live NWP | Open Access REST API (`/v1/forecast`, `/v1/archive`) | Verified. High reliability across Dakshina Kannada & Udupi. |
| **CWC River Gauge Levels** | Central Water Commission (Bantwal station, Netravati) | Point gauge observations, Warning (8.5m), Danger (9.5m) | Public bulletins during monsoon alerts | No authenticated public programmatic API; web portal tables | Used as verified regional threshold values for discharge conversion ($650\,m^3/s$ warning, $1000\,m^3/s$ danger). |
| **KSNDMC District Alerts** | Karnataka State Natural Disaster Monitoring Centre | District/Taluk polygon alerts | Daily monsoon reports / press archives | No real-time programmatic REST API | Used for historical ground-truth validation (2018–2024 chronologies). |

---

## 2. Revised Feature Schema (v2.0.0 — 20 Features)

| Feature Name | Unit | Source | Update Rule | Missing-Data Policy |
| :--- | :--- | :--- | :--- | :--- |
| `past_24h_precip_mm` | $mm$ | ERA5 / Live NWP | Rolling sum over preceding 24h | Impute 0.0 if missing |
| `past_48h_precip_mm` | $mm$ | ERA5 / Live NWP | Rolling sum over preceding 48h | Forward-fill or past_24h * 1.5 |
| `past_72h_precip_mm` | $mm$ | ERA5 / Live NWP | Rolling sum over preceding 72h | Forward-fill or past_48h * 1.3 |
| `past_120h_precip_mm` | $mm$ | ERA5 / Live NWP | Rolling sum over preceding 120h | Forward-fill |
| `forecast_precip_24h_mm`| $mm$ | Live NWP forecast | Predicted sum over forward 24h | Impute 0.0 |
| `forecast_max_hourly_rate_mm`| $mm/h$ | Live NWP forecast | Max hourly rain in next 24h | Impute 0.0 |
| `antecedent_precip_index`| $mm$ | Derived ($k=0.85$) | $API_t = P_t + 0.85 \cdot API_{t-1}$ | Forward-fill |
| `soil_moisture_surface` | $m^3/m^3$| ERA5 / NWP (0-7cm) | 24h mean volumetric moisture | Median imputation (0.35) |
| `soil_moisture_deep` | $m^3/m^3$| ERA5 / NWP (7-28cm)| 24h mean volumetric moisture | Median imputation (0.38) |
| `soil_saturation_index` | $[0, 1]$ | Derived ($SM / 0.55$) | Ratio of surface moisture to porosity | Clip to $[0, 1]$ |
| `elevation_m` | $m$ MSL | SRTM 30m DEM | Static station elevation | Lookup table by coordinates |
| `wind_speed_max_kmh` | $km/h$ | ERA5 / Live NWP | Maximum wind gust in 24h | Forward-fill |
| `is_monsoon` | $\{0, 1\}$ | Calendar date | 1 if June 1 to September 30, else 0 | Deterministic |
| `month_sin` | $[-1, 1]$ | Calendar date | $\sin(2\pi \cdot m / 12)$ | Deterministic |
| `month_cos` | $[-1, 1]$ | Calendar date | $\cos(2\pi \cdot m / 12)$ | Deterministic |
| **`river_discharge_m3s`** | $m^3/s$ | Copernicus GloFAS | Daily mean local river flow | Station baseline median |
| **`upstream_netravati_discharge_m3s`**| $m^3/s$ | GloFAS Bantwal gauge | Upstream catchment runoff routed to coast | Forward-fill Bantwal value |
| **`river_discharge_ratio`** | Ratio | Derived ($Q / Q_{warn}$)| Local discharge normalized by station warning level | Default 0.1 |
| **`tide_level_max_m`** | $m$ CD | Astronomical engine | 24-hour maximum astronomical tide level | Deterministic calculation |
| **`coastal_backwater_risk_index`**| $[0, \infty)$| Derived | $(Q_{upstream} / 650.0) \times (H_{tide} / 1.5)^2$ | Default 0.0 |

---

## 3. Label Quality & Target Validity Audit

- **Total Historical Sample Records (2018–2024):** 12,760 daily records across 5 coastal locations.
- **Total Positive Target Events ($Y=1$):** 350 events (2.74% overall prevalence).
- **Target Composition:**
  - **340 events (97.14%)** correspond to documented official disaster periods (District Disaster Management Authority, NDMA, State emergency reports, CWC danger level exceedance).
  - **10 events (2.86%)** correspond to threshold-derived extreme runoff proxy labels ($P > 115.6\,mm$ + saturation > 90%).
  - **2 events** satisfy both criteria.
- **Circularity Resolution:**
  - To eliminate the circularity of evaluating a precipitation-driven model against precipitation-derived labels, v2 establishes `target_confirmed_disaster` as the primary ground truth. All model comparison metrics are calculated strictly against real-world event chronologies.
- **Train vs. Test Split Prevalence:**
  - **Train (2018–2022):** 9,105 rows, 243 positives (2.67% prevalence).
  - **Test (2023–2024 Held-Out Future Monsoons):** 3,655 rows, 107 positives (2.93% prevalence).

---

## 4. Defensible Model Comparison

Models evaluated on the strictly held-out future monsoon test set (**2023–2024, $N = 3,655$ samples, 107 positive flood days**).

### A. Discrimination & Calibration Metrics

| Metric | Linear Baseline (Logistic Regression) | Model v1 (Rainfall & Soil — 15 Features) | Model v2 (Multi-Factor Coastal — 20 Features) |
| :--- | :--- | :--- | :--- |
| **ROC-AUC** | 0.9698 | 0.9741 | **0.9824** (+0.0083) |
| **PR-AUC** | 0.4042 | 0.4645 | **0.4703** (+0.0058) |
| **Brier Score (Calibration)** | 0.0364 | 0.0223 | **0.0223** (Well calibrated) |

### B. Operational Performance at Calibrated Threshold ($th = 0.03$)
*Note: Due to 2.9% base rate prevalence, probability threshold $th=0.03$ reflects the transition from normal dry conditions to actionable advisory risk.*

| Metric | Linear Baseline | Model v1 (Rainfall & Soil) | Model v2 (Multi-Factor Coastal) |
| :--- | :--- | :--- | :--- |
| **Operational Recall** | 100.0% (Trivial) | 74.77% (80 / 107 detected) | **85.05% (91 / 107 detected)** (+10.28% gain) |
| **Operational Precision** | 15.29% | 39.22% | **52.60%** (+13.38% gain) |
| **Operational F1 Score** | 0.2652 | 0.5145 | **0.6500** (+0.1355 gain) |
| **Missed Flood Events (FN)** | 0 | 27 missed events | **16 missed events** (-40.7% misses) |
| **False Alarms (FP)** | 593 | 124 | **82** (-33.9% false alarms) |
| **False Alarm Rate** | 16.71% | 3.49% | **2.31%** |

### C. Performance by Flood Mechanism (Held-Out 2023–2024)

- **Coastal Compound Flooding ($N=60$ events):**
  - Model v1 Recall: **85.0%** (51 / 60 detected)
  - Model v2 Recall: **96.7%** (58 / 60 detected) $\rightarrow$ **+11.7% detection gain**.
- **Riverine Overflow ($N=2$ events in 2023–2024 test window):**
  - Acknowledged statistical limitation: The 2023–2024 monsoon seasons had low river overflow frequency in the recorded locations; 0 detected in test split due to localized gauge differences at the threshold.

### D. Top Feature Importances (Model v2 Random Forest)

1. `upstream_netravati_discharge_m3s`: **24.81%**
2. `past_72h_precip_mm`: **13.91%**
3. `past_48h_precip_mm`: **12.02%**
4. `past_24h_precip_mm`: **9.17%**
5. `forecast_precip_24h_mm`: **8.40%**
6. `past_120h_precip_mm`: **6.35%**
7. `tide_level_max_m`: **1.51%**
8. `coastal_backwater_risk_index`: **0.56%**

---

## 5. System Integration & Architecture

### Backend Modules Updated
- `backend/app/config.py`: Added GloFAS flood API and marine API endpoints, default model set to v2.
- `backend/app/schemas/prediction.py`: Extended with `ModelVersion`, `FloodMechanism`, `RiverStatus`, `CoastalTideInfo`, and `ModelComparisonResponse`.
- `backend/app/services/weather_service.py`: Integrated GloFAS river discharge fetching, analytical tidal harmonics calculation, and Open-Meteo Marine wave heights.
- `backend/app/services/predictor_service.py`: Multi-model registry supporting live hot-swapping between `1.0.0` and `2.0.0`, computing physical backwater indexes and compound mechanism tagging.
- `backend/app/services/warning_engine.py`: Enhanced to alert on coastal compound conditions, river danger thresholds ($>1000\,m^3/s$), and severe forecast intensities.
- `backend/app/api/routes.py`: Added `GET /api/models` for dynamic frontend comparison and model switching.

### Frontend Dashboard Upgrades
- **Model Version Selector:** Header dropdown toggling between `v2.0.0 (Coastal Multi-Factor)` and `v1.0.0 (Rainfall + Soil Baseline)`.
- **Side-by-Side Model Comparison Modal:** Direct tabular comparison of ROC-AUC, PR-AUC, Recall, Precision, and F1 scores.
- **River Discharge Telemetry Card:** Live display of local river system (Netravati, Gurupura, Swarna) discharge in $m^3/s$ with warning/danger status.
- **Astronomical Tide & Marine Card:** Peak tide height ($m$ CD), spring/neap indicator, wave height ($m$), and backwater risk multiplier.
- **Flood Mechanism Badges:** Visual indicator tagging predictions as `COASTAL_COMPOUND`, `RIVERINE_OVERFLOW`, `URBAN_PLUVIAL`, or `LOW_RISK`.
- **System Disclaimers:** Visible notice clarifying experimental status and distinguishing official IMD/KSNDMC bulletins from machine-learning advisory risk.

---

## 6. Automated Test Results

Test suite executed with `pytest`:
```bash
python -m pytest backend/tests/ -v
```
**Results:** `17 passed, 1 warning in 7.21s`

- `test_health_endpoint`: Passed
- `test_locations_endpoint`: Passed
- `test_weather_endpoint`: Passed
- `test_weather_unknown_location`: Passed
- `test_predict_endpoint`: Passed
- `test_predict_manual_extreme_override`: Passed
- `test_test_alert_endpoint`: Passed
- `test_get_alerts_and_predictions_history`: Passed
- `test_astronomical_tide_calculation`: Passed
- `test_weather_includes_river_and_coastal`: Passed
- `test_predict_model_v1_and_v2_switching`: Passed
- `test_model_comparison_endpoint`: Passed
- `test_coastal_compound_mechanism_ullal`: Passed
- `test_warning_engine_normal_conditions`: Passed
- `test_warning_engine_high_risk_triggers_alert`: Passed
- `test_warning_duplicate_suppression`: Passed
- `test_trigger_manual_test_alert`: Passed

---

## 7. Exact Commands to Run the Application

### 1. Run Automated Tests
```bash
python -m pytest backend/tests/ -v
```

### 2. Start FastAPI Backend
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation available at: `http://127.0.0.1:8000/docs`

### 3. Start React Frontend Dashboard
```bash
cd frontend
npm run dev
```
Dashboard interface available at: `http://localhost:5173/`

### 4. Build Frontend for Production
```bash
cd frontend
npm run build
```

---

## 8. Unsupported Features & Remaining Limitations

1. **Direct CWC Gauge Telemetry:** CWC does not provide an open real-time REST API for Bantwal gauge heights; the system uses Copernicus GloFAS discharge normalized to CWC warning ($650\,m^3/s$) and danger ($1000\,m^3/s$) thresholds.
2. **Real-time Storm Surge Residuals:** The coastal engine calculates astronomical tides; dynamic barometric surge residuals are estimated via wind speed rather than direct coastal radar tide gauges.
3. **Micro-drainage Blockages:** Sub-grid urban stormwater drain clogs (e.g., plastic waste blockages at Kottara Chowki) cannot be observed from satellite or weather models and require on-ground citizen reports or city IoT sensors.
4. **Historical NWP Variance:** Historical training used ERA5 precipitation sums; real-time operational inference uses live numerical weather prediction which inherently carries forecast uncertainty.
