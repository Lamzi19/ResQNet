# ResQNet — AI-Powered Flood Intelligence & Emergency Early-Warning Platform

Disaster-management and early-warning intelligence platform designed for **Kerala** (all 14 revenue districts) and **coastal Karnataka** (Dakshina Kannada & Udupi).

ResQNet integrates:
- **Hydrometeorological Telemetry**: Live Open-Meteo ECMWF/GFS numerical weather predictions, Copernicus GloFAS river discharge routing, and Survey of India astronomical tidal harmonics (Cochin and Mangalore ports).
- **Dual Regional Operations**:
  - **Kerala Active Dashboard**: Operational coverage across all 14 revenue districts (Ernakulam, Wayanad, Idukki, Alappuzha, etc.) utilizing official IMD rainfall classification criteria and Central Water Commission (CWC) river gauge danger thresholds.
  - **Coastal Karnataka Baseline**: Preserved historical benchmark evaluated on 2018–2024 ECMWF ERA5 reanalysis and KSNDMC ground-truth chronicles.
- **Calibrated Multi-Factor Intelligence**: Evaluates riverine overflow, urban pluvial waterlogging, and estuarine backwater stalling.
- **Early Warning Engine**: Configurable risk thresholds, 3-hour cooldown timers, duplicate alert suppression, and in-app test dispatches.
- **Interactive React Dashboard**: React 19 + TypeScript + Leaflet map with GeoJSON district catchment overlays, Recharts rainfall trends, and scenario simulation sandbox.
- **Decoupled Architecture for Phase 2 SOS**: Defined module boundaries and versioned message contracts for citizen offline store-and-forward mesh distress beacons and rescuer command triage.

---

## 1. Documentation Index

Detailed architectural and technical specifications are available in `docs/`:
- **[System Architecture](docs/architecture.md)**: System topology, subsystem boundaries, data flows, and planned module interfaces.
- **[Data Sources & Telemetry](docs/data-sources.md)**: Inventory of weather, GloFAS river, tidal, and CWC data streams, caching rules, and privacy protections.
- **[Model Card & Evaluation](docs/model-card.md)**: Model details (v1 & v2), performance benchmarks, and explicit Kerala rule engine status.
- **[Integration Plan & SOS Contract](docs/integration-plan.md)**: Target repository layout, versioned SOS message contract proposal, and decoupled interface adapters.
- **[Coastal Flood Upgrade Report](docs/coastal_flood_intelligence_report.md)**: Performance lift and evaluation report from the Phase 1 multi-factor upgrade.

---

## 2. Model Status & Regional Distinctions

ResQNet maintains a clear distinction between its active operational geography and its benchmark ML models:

| Attribute | Kerala (Active Operational Dashboard) | Coastal Karnataka (Preserved Benchmark Archive) |
| :--- | :--- | :--- |
| **Coverage** | All 14 Revenue Districts (Ernakulam, Wayanad, etc.) | 5 Coastal Gauge Stations (Bantwal, Mangaluru, Ullal, etc.) |
| **Engine** | Multi-Factor Hydrological Rule Engine (`is_rule_based: true`) | Calibrated Machine Learning Pipeline (Random Forest + Logistic Baseline) |
| **Artifacts** | Dynamic evaluation via `backend/app/services/predictor_service.py` | `ml/artifacts/flood_model_pipeline_v1.joblib` (v1.0.0)<br>`ml/artifacts/flood_model_pipeline_v2_coastal.joblib` (v2.0.0) |
| **Features** | IMD rainfall thresholds (64.5 / 115.6 / 204.4mm), CWC gauge limits, GloFAS river ratios, Cochin tides | v1: 15 features (Rainfall & soil moisture)<br>v2: 20 features (River discharge, upstream influx, tides, backwater risk) |
| **Training Status**| **Operational Rule Engine Active; Dedicated Kerala ML training remains an open future sprint** | Fully trained on 2018–2022 ERA5, evaluated on held-out 2023–2024 monsoons (backed up in `ml_backup_karnataka/`) |

---

## 3. Quickstart: Running the System Locally

### Step A: Backend Setup & Launch
```bash
# From workspace root
pip install -r backend/requirements.txt

# Start the FastAPI server (runs on http://localhost:8000)
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

The interactive OpenAPI documentation will be accessible at:
- **Swagger UI**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`

### Step B: Unified ResQNet Command Dashboard Launch
```bash
# In a separate terminal, navigate to the frontend directory
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser. The unified dashboard contains:
- **ML Flood Intelligence & Early Warning**: Live rainfall trends, river discharge, tidal stalling, and catchment overlays.
- **Relief Safe-Spots**: Proximity-routed Kerala relief camps and verified capacity.
- **SOS Operations**: Unified emergency distress queue, triage priority explanation, rescue vessel tasking, and safety-check broadcasts.

### Step C: Offline Bluetooth LE Distress Gateway (For Offline Android SOS)
```bash
# In a separate terminal, launch the laptop-side Bluetooth Low Energy receiver
python backend/scripts/ble_gateway.py
```
Listens for 56-byte BLE distress beacons broadcast by offline citizen Android handsets, validates and unpacks the frames, and persists them into the local backend without requiring internet.

---

## 4. Running Automated Tests

Run the full pytest suite for API routes, weather parsing, predictor service, Kerala geography, and warning engine rules:

```bash
python -m pytest backend/tests/ -v
```

All 22 unit and integration tests pass cleanly.

To verify the frontend build:
```bash
cd frontend
npm run build
```

---

## 5. Security & Responsible Use Notice

- **Official Protocol Supremacy**: ResQNet is an experimental decision-support prototype. It does not replace or supersede emergency directives, evacuation notices, or Red/Orange alerts issued by the **Kerala State Disaster Management Authority (KSDMA)**, the **India Meteorological Department (IMD)**, or District Disaster Management Authorities.
- **Privacy Policy**: Zero citizen personally identifiable information (PII) or real-time location traces are stored in weather telemetry or committed to version control. Strict `.gitignore` rules prevent accidental commits of local secrets, private distress logs, or SQLite database files.
