# ResQNet System Architecture & Engineering Specification

## 1. Executive Overview

**ResQNet** is a modular disaster-intelligence and emergency-response platform designed for high-vulnerability tropical coastal and riverine regions in South India, with primary operational coverage across all **14 revenue districts of Kerala** and a preserved benchmark archive for **coastal Karnataka (Dakshina Kannada & Udupi)**.

The system combines:
1. **Hydrometeorological Intelligence**: Real-time atmospheric forecasts (Open-Meteo ECMWF/GFS), Copernicus GloFAS river discharge routing, and deterministic Survey of India astronomical tidal harmonics (Cochin and Mangalore ports).
2. **Operational Decision Support**: Calibrated machine learning risk estimators (Karnataka models v1 and v2) and an operational rule-based risk evaluation engine (Kerala districts) enforcing IMD rainfall thresholds and Central Water Commission (CWC) river gauge warning levels.
3. **Multi-Channel Early Warning Engine**: Automated advisory generation, cooldown management, duplicate suppression, and in-app simulation test dispatches.
4. **Interactive Command Dashboard**: React 19 + TypeScript + Leaflet map with GeoJSON catchment overlays, real-time telemetry gauges, factor attribution breakdowns, and scenario stress testing.
5. **Decoupled Architecture for Emergency SOS**: Clear module boundaries prepared for peer-to-peer store-and-forward mesh distress beacons, citizen mobile applications, and incident command triage.

---

## 2. Comprehensive System Architecture

```
                                  LIVE TELEMETRY SOURCES
  ┌─────────────────────────┐    ┌───────────────────────────┐    ┌─────────────────────────┐
  │ Open-Meteo Forecast NWP │    │  Copernicus GloFAS River  │    │  Survey of India Tidal  │
  │ (Precip, Temp, Soil SM) │    │ Discharge API (m3/s Flow) │    │  Harmonics (M2,S2,K1,O1)│
  └───────────┬─────────────┘    └─────────────┬─────────────┘    └────────────┬────────────┘
              │                                │                               │
              └───────────────────────┬────────┴───────────────────────────────┘
                                      │ JSON over HTTPS (15-min TTL In-Memory Cache)
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SHARED FASTAPI BACKEND                                     │
│                                                                                           │
│  ┌─────────────────────────────────┐           ┌──────────────────────────────────────┐  │
│  │         Weather Service         │──────────▶│          Predictor Service           │  │
│  │  - TTL caching & unit normalize │           │  - Karnataka ML Pipeline (v1/v2)     │  │
│  │  - Antecedent rain & soil sat   │           │  - Kerala Rule-Based Engine (IMD/CWC)│  │
│  │  - Estuarine compound risk calc │           │  - Multi-Factor Attribution Calc     │  │
│  └─────────────────────────────────┘           └──────────────────┬───────────────────┘  │
│                                                                   │                       │
│  ┌─────────────────────────────────┐                              │                       │
│  │        Geography Engine         │                              ▼                       │
│  │  - 14 Kerala District Bounds    │           ┌──────────────────────────────────────┐  │
│  │  - CWC River Gauge Database     │◀──────────│            Warning Engine            │  │
│  │  - Coastal Estuary Benchmarks   │           │  - Multi-tier thresholds (KSNDMC/IMD)│  │
│  └─────────────────────────────────┘           │  - 3-hour Cooldown & Suppression     │  │
│                                                │  - Official Directives Ingestion     │  │
│  ┌─────────────────────────────────┐           └──────────────────┬───────────────────┘  │
│  │         SQLite Database         │                              │                       │
│  │  - Prediction Audit Trail       │◀─────────────────────────────┘                       │
│  │  - Alert Events & Test Pushes   │                                                      │
│  │  - Official Agency Advisories   │                                                      │
│  └─────────────────────────────────┘                                                      │
└───────────────────────────────┬───────────────────────────────────────────────────────────┘
                                │ RESTful JSON APIs (CORS Enabled)
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────────────────┐
│     KERALA FLOOD DASHBOARD    │               │       PROPOSED SOS & RESCUE PHASE         │
│  (React 19 / TypeScript / Vite│               │          (Decoupled Integration)          │
│                               │               │                                           │
│  - 14 District Map (Leaflet)  │               │  ┌─────────────────────────────────────┐  │
│  - Factor Attribution Radar   │               │  │    Citizen Android SOS App (Kotlin) │  │
│  - River & Tide Telemetry     │               │  │    - Offline-first Room SQLite DB   │  │
│  - 48h Hourly Rain Trends     │               │  │    - Panic button & GPS accuracy    │  │
│  - Scenario Simulation Sandbox│               │  └──────────────────┬──────────────────┘  │
│  - In-App Alert Feed          │               │                     │ Store-and-Forward   │
└───────────────────────────────┘               │                     ▼                     │
                                                │  ┌─────────────────────────────────────┐  │
                                                │  │    Offline BLE/Wi-Fi Aware Mesh     │  │
                                                │  │    - Hop limits, TTL expiration     │  │
                                                │  │    - Zero-PII distress beacon       │  │
                                                │  └──────────────────┬──────────────────┘  │
                                                │                     │ Gateway Sync        │
                                                │                     ▼                     │
                                                │  ┌─────────────────────────────────────┐  │
                                                │  │    Rescuer Incident Command Portal  │  │
                                                │  │    - Live triage & flood overlay    │  │
                                                │  │    - Priority rescue queues         │  │
                                                │  └─────────────────────────────────────┘  │
                                                └───────────────────────────────────────────┘
```

---

## 3. Module Boundaries & Responsibilities

To enable seamless GitHub collaboration and allow independent development of the upcoming SOS phase without disrupting the operational flood dashboard, the repository enforces five distinct module boundaries:

### Module 1: Kerala Flood Intelligence & Machine Learning
- **Scope**: Weather telemetry ingestion, river discharge tracking, tidal harmonics computation, spatial bounds parsing, and risk prediction.
- **Key Files**:
  - `backend/app/geography_kerala.py`: Centralized metadata for all 14 Kerala revenue districts, river basins (Periyar, Bharathappuzha, Pamba, Chaliyar, etc.), and CWC gauge danger thresholds.
  - `backend/app/kerala_districts.geojson`: Official district boundary polygons for Leaflet visualization.
  - `backend/app/services/weather_service.py`: Multi-provider weather parser, GloFAS river discharge fetcher, and Survey of India tidal harmonic equations ($M_2, S_2, K_1, O_1$).
  - `backend/app/services/predictor_service.py`: Operational risk estimator with multi-factor attribution.
  - `ml/`: Model training pipelines, datasets, and serialization scripts for historical evaluation.
  - `ml_backup_karnataka/`: Immutable baseline backup of Karnataka ERA5 reanalysis and models.

### Module 2: Shared FastAPI Backend
- **Scope**: Core HTTP routing, database persistence, CORS configuration, and early warning logic.
- **Key Files**:
  - `backend/app/main.py`: ASGI application entrypoint, lifespan startup tasks, and middleware.
  - `backend/app/config.py`: Environment configuration, API paths, and regional station catalogs.
  - `backend/app/api/routes.py`: REST endpoints (`/api/health`, `/api/locations`, `/api/weather/{id}`, `/api/predict`, `/api/alerts`, `/api/advisories`, `/api/geography/kerala`).
  - `backend/app/database/`: SQLite engine, connection pooling, and ORM models (`PredictionRecord`, `AlertEvent`, `OfficialAdvisory`).
  - `backend/app/services/warning_engine.py`: Cooldown timer (3 hours), suppression of duplicate alarms, and automated escalation.

### Module 3: Future Citizen Android SOS Application (Phase 2)
- **Scope**: Native mobile application enabling citizens in distress to broadcast emergency signals without cellular or internet connectivity.
- **Target Boundary**: `apps/citizen-android/` (planned)
- **Key Capabilities**:
  - Offline-first local persistence (Room Database / SQLite).
  - Background Bluetooth Low Energy (BLE) peripheral advertising and central scanning.
  - High-accuracy fused location tracking with explicit horizontal error radii (`accuracy_m`).
  - Strict privacy sandboxing: no device identifiers, phone numbers, or unencrypted personal records in broadcast frames.

### Module 4: Future Offline Store-and-Forward Mesh Protocol (Phase 2)
- **Scope**: Communication protocol layer handling hop counting, relay histories, packet deduplication, and opportunistic gateway synchronization.
- **Target Boundary**: `protocols/sos-mesh/` (planned)
- **Key Capabilities**:
  - Ultra-compact packet format (< 512 bytes) optimized for BLE advertisement payloads.
  - TTL-based packet drop to prevent broadcast saturation during massive deluge events.
  - Opportunistic store-and-forward routing: nodes buffer incoming SOS packets and re-broadcast when encountering new peers.
  - Cryptographic tamper-proofing using asymmetric key pairs (e.g., Ed25519).

### Module 5: Future Rescuer Command & Triage Dashboard (Phase 3)
- **Scope**: Operational incident command dashboard for National Disaster Response Force (NDRF), Kerala Fire & Rescue, and district emergency operation centers (DEOC).
- **Target Boundary**: `dashboards/rescuer-portal/` (planned)
- **Key Capabilities**:
  - Real-time geospatial map combining active SOS distress incidents with live flood depth and river overtopping predictions.
  - Automated triage queue categorized by urgency (CRITICAL, HIGH, MODERATE).
  - Cluster analysis identifying isolated communities cut off by bridge or road washouts.

---

## 4. Current Model Status & Operational Distinctions

It is vital to maintain clear transparency regarding the operational status of the predictive models across regions:

| Attribute | Coastal Karnataka Baseline | Kerala Active Geography |
| :--- | :--- | :--- |
| **Model Type** | Machine Learning Pipeline (Random Forest Classifier + Logistic Regression Baseline) | Operational Rule-Based Decision Engine (Multi-Factor Hydrological Rules) |
| **Artifacts** | `ml/artifacts/flood_model_pipeline_v1.joblib`<br>`ml/artifacts/flood_model_pipeline_v2_coastal.joblib` | Deterministic logic evaluated dynamically in `PredictorService` |
| **Training Data** | 2018–2022 ECMWF ERA5 reanalysis across 5 coastal Karnataka river stations | None yet (planned future ML training sprint) |
| **Evaluation Data**| 2023–2024 held-out future monsoon test set | Verified against 2018 and 2024 historical rainfall thresholds |
| **Feature Set** | v1: 15 features (Rainfall & soil moisture)<br>v2: 20 features (River discharge, upstream influx, tidal levels, backwater risk) | IMD rainfall criteria (64.5mm, 115.6mm, 204.4mm), CWC gauge levels, GloFAS discharge, Cochin Port tidal surge |
| **Status** | Fully trained, evaluated, and backed up in `ml_backup_karnataka/` | **Operational Rule Engine Active; Dedicated ML training remains incomplete** |
| **Disclaimer** | Benchmarked historical prototype | Explicitly marked `is_rule_based: true`; does not replace official KSDMA directives |

---

## 5. Planned Module Interfaces & Decoupling Architecture

To ensure the SOS mesh system and flood intelligence service integrate cleanly without circular dependencies:

1. **Unidirectional Hazard Enrichment**: The SOS subsystem queries the Flood Intelligence API purely as a client (`GET /api/predict` or Python service interface `PredictorService.get_hazard_context(lat, lon)`). The flood prediction engine has zero knowledge of citizen identity, phone numbers, or private incident records.
2. **Gateway Ingestion Pipeline**: When a field mesh node or mobile gateway regains cellular or satellite internet connectivity, it POSTs the buffered `SOSMessageContract` packet to an isolated endpoint (`/api/sos/v1/ingest`).
3. **Event-Driven Rescuer Dispatch**: Newly ingested SOS beacons trigger asynchronous WebSocket or Server-Sent Events (SSE) to the Rescuer Dashboard, enriched with local catchment flood warnings.

```
┌─────────────────────────────────┐
│     Incoming SOS Beacon         │
│  (From Citizen Android Handset) │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Mesh Gateway Ingestion API    │
│    (Validates & Deduplicates)   │
└────────────────┬────────────────┘
                 │
                 ├──▶ Writes to Encrypted SQLite/PostgreSQL SOS Store
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│    Spatial-Hazard Enrichment Adapter (Bridge)    │
│                                                 │
│  Calls `PredictorService.evaluate_location()`   │
│  with victim GPS coordinates (lat, lon).        │
│  Extracts:                                      │
│  - Local River Overflow Probability             │
│  - Upstream Catchment Runoff Spike              │
│  - Tidal Backwater Flooding Risk                │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│    Triage & Rescuer Dispatch Notification       │
│  (Pushes prioritized alert to Rescuer Dashboard)│
└─────────────────────────────────────────────────┘
```

This decoupled design guarantees that either module can be refactored, updated, or tested independently without breaking the operational early warning dashboard.
