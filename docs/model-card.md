# ResQNet Model Card: Flood Risk Estimation & Operational Warning Engines

## 1. Model Details

- **Model Name**: ResQNet Early-Warning Decision Pipeline
- **Versions Covered**:
  - `v1.0.0` (Karnataka Rainfall & Soil Moisture Baseline — Serialized Artifact: `ml/artifacts/flood_model_pipeline_v1.joblib`)
  - `v2.0.0` (Karnataka Multi-Factor Coastal & Riverine Pipeline — Serialized Artifact: `ml/artifacts/flood_model_pipeline_v2_coastal.joblib`)
  - `Kerala Operational Risk Engine` (Deterministic Multi-Factor Rule Engine in `backend/app/services/predictor_service.py`)
- **Model Types**:
  - v1.0.0 & v2.0.0: Calibrated Random Forest Classifier (`n_estimators=100`, max depth balanced) with CalibratedClassifierCV (isotonic / sigmoid calibration) alongside a Logistic Regression linear baseline.
  - Kerala Active Geography: Multi-factor hydrological rule engine incorporating IMD rainfall classification criteria, Central Water Commission (CWC) river gauge danger levels, GloFAS river discharge ratios, and Cochin Port tidal harmonics.
- **Developers**: ResQNet Open Source Collaboration Team
- **License**: MIT License (for open academic & humanitarian deployment)
- **Primary Point of Contact**: ResQNet Maintainers

---

## 2. Intended Use & Target Users

### Intended Use Cases
1. **Decision Support for Disaster Authorities**: Provides automated, probabilistic 24-hour flood inundation indicators across coastal, midland, and riverine catchments.
2. **Early-Warning Screening**: Identifies impending compound risks (e.g., intense rainfall coupled with spring tide backwater) prior to gauge overtopping.
3. **Disaster Simulation & Planning**: Allows emergency response planners to stress-test hypothetical cloudburst scenarios (e.g., $+150\,\text{mm}$ forecast rainfall) and inspect catchment vulnerability.

### Out-of-Scope & Prohibited Uses
- **Autonomous Emergency Decrees**: Must NOT be used to autonomously issue mandatory public evacuation orders or bypass official protocols of the Kerala State Disaster Management Authority (KSDMA) or India Meteorological Department (IMD).
- **Automated Dam Spillway Actuation**: Must NOT be connected directly to dam gate controllers or automated reservoir spillways without manual hydrological engineer sign-off.
- **Financial Insurance Denial**: Must NOT be used as the sole determinant for casualty claims or property flood zoning disputes.

---

## 3. Geographic Scope & Current Model Status

ResQNet maintains a transparent distinction between its operational active geography and its preserved historical benchmark models:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   RESQNET STATUS                                 │
├────────────────────────────────────────┬─────────────────────────────────────────┤
│    KERALA (Active Operational UI)      │      KARNATAKA (Preserved Benchmark)    │
│                                        │                                         │
│ - Coverage: All 14 Revenue Districts   │ - Coverage: 5 Coastal Stations (DK &    │
│ - Engine: Multi-Factor Rule Engine     │   Udupi River Basins)                   │
│ - Features: IMD Rainfall, CWC Gauges,  │ - Engine: ML Random Forest (v1 & v2)    │
│   GloFAS River Flow, Cochin Tides      │ - Features: 15 & 20 Feature Vectors     │
│ - Flag: `is_rule_based: true`          │ - Flag: `is_rule_based: false`          │
│ - ML Training Status: INCOMPLETE       │ - ML Training Status: COMPLETE          │
│   (Dataset curation & ML fitting       │   (Trained on 2018–2022 ERA5,           │
│    for Kerala remains future work)     │    evaluated on 2023–2024 monsoons)     │
└────────────────────────────────────────┴─────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Status of Kerala Machine Learning Pipeline**:  
> In the current codebase, predictions for all 14 Kerala revenue districts are calculated using the verified operational rule engine (`is_rule_based: true`). While the backend architecture is fully prepared to load serialized Kerala ML models once trained, **dedicated historical ML training for Kerala (2018–2024 ERA5 reanalysis and KSDMA flood chronologies) remains an open milestone for the upcoming ML sprint.**

---

## 4. Training & Evaluation Methodology (Karnataka Artifacts)

### Training Set (2018–2022)
- **Source**: ECMWF ERA5 & ERA5-Land Reanalysis (12,760 daily station records) and Copernicus GloFAS river discharge.
- **Sample Distribution**: 9,105 days, 243 confirmed disaster events (2.67% base prevalence).
- **Temporal Alignment**: Strictly leakage-free; features at time $T$ utilize only antecedent observations up to day $T$ and numerical forecasts forward to $T+24\text{h}$.

### Held-Out Future Monsoon Test Set (2023–2024)
- **Sample Distribution**: 3,655 days, 107 confirmed disaster events (2.93% base prevalence).
- **Evaluation Discipline**: Strict out-of-time evaluation on future unseen monsoons. No data from 2023–2024 was available during hyperparameter tuning or feature selection.

---

## 5. Verified Performance Metrics (v1 vs v2 Benchmark)

| Evaluation Metric | Version 1.0.0 (Rainfall & Soil) | Version 2.0.0 (Multi-Factor Coastal) | Operational Impact |
| :--- | :--- | :--- | :--- |
| **Feature Dimension** | 15 input features | 20 input features (River + Tides) | Incorporates compound estuarine physics |
| **Overall Test Recall** | 88.8% | **94.4%** | $+5.6\%$ increase in true disaster detection |
| **Coastal Compound Event Recall** | 85.0% | **96.7%** | $+11.7\%$ critical gain in estuarine backwater events |
| **False Positive Rate (FPR)** | 7.1% | **4.7%** | **34% reduction in false alarms** |
| **Brier Calibration Score** | 0.041 | **0.029** | Probabilities more closely reflect true frequency |
| **ROC-AUC** | 0.942 | **0.968** | Superior discrimination between benign and deluge days |

---

## 6. Ethical Considerations & Limitations

1. **Topographical Vulnerability Bias**: High-elevation highland stations (e.g., Wayanad, Idukki, Belthangady) exhibit steep flash-flood and debris-flow kinetics that differ fundamentally from estuarine backwater stalling (e.g., Alappuzha/Kuttanad or Mangaluru Urban). Rule thresholds are stratified accordingly (`HIGHLAND_GHATS`, `MIDLAND`, `COASTAL`, `LOWLAND_KUTTANAD`).
2. **Dam Operational Opacity**: Real-time reservoir water levels and emergency spillway gate release schedules (e.g., Idukki Arch Dam, Mullaperiyar, Malampuzha) are not published via public machine-readable APIs. The model relies on Copernicus GloFAS modeled river discharge as a proxy.
3. **Official Supremacy**: ResQNet prominently presents an official disaster protocol banner across all views, reminding emergency personnel that official bulletins from KSDMA, IMD, and District Collectors supersede all automated outputs.
