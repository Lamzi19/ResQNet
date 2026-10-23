# ResQNet Integration Plan: SOS Mesh & Rescuer Portal (Phase 2 & 3 Roadmap)

## 1. Executive Summary

This integration plan defines the architectural roadmap for expanding **ResQNet** from an active flood-intelligence and early-warning dashboard into an end-to-end emergency response ecosystem.

The system will incorporate:
- **Phase 1 (Current / Operational)**: Kerala & Coastal Karnataka Flood Intelligence, Live Hydrometeorological Telemetry, Early Warning Engine, and Interactive React Dashboard.
- **Phase 2 (Upcoming / Proposal)**: Citizen Android SOS Mobile App and Offline Peer-to-Peer Store-and-Forward Mesh Relay over Bluetooth LE / Wi-Fi Aware.
- **Phase 3 (Future / Planning)**: Rescuer Incident Command Portal and Priority Triage Dispatch Engine.

---

## 2. Target Repository Layout

To maintain full backward compatibility with the existing Python backend, React frontend, and ML artifacts while accommodating upcoming mobile and protocol modules, the repository follows a clean monorepo structure.

> [!NOTE]
> **Zero File Breakage Policy**: All existing files in `backend/`, `frontend/`, `ml/`, `ml_backup_karnataka/`, and `docs/` remain in their verified working locations. New modules are added under dedicated parent directories as development begins.

```
resqnet/
├── .gitignore                         # Comprehensive ignore rules (secrets, venvs, DBs, private SOS)
├── .env.example                       # Non-sensitive environment variable template
├── README.md                          # Repository quickstart and system summary
│
├── docs/                              # System documentation & specifications
│   ├── architecture.md                # System topology & module boundaries
│   ├── data-sources.md                # Telemetry streams & API contracts
│   ├── model-card.md                  # Model details, performance, & Kerala status
│   ├── integration-plan.md            # This document: SOS & mesh roadmap
│   └── coastal_flood_intelligence_report.md # Phase 1 upgrade findings
│
├── backend/                           # Shared FastAPI Backend & Services
│   ├── app/
│   │   ├── main.py                    # ASGI application & lifespan tasks
│   │   ├── config.py                  # Settings & station catalogs
│   │   ├── geography_kerala.py        # Centralized Kerala districts & river basins
│   │   ├── kerala_districts.geojson   # 14 revenue district boundary polygons
│   │   ├── api/
│   │   │   ├── routes.py              # Operational flood & early-warning routes
│   │   │   └── sos_routes.py          # [PHASE 2 PROPOSAL] Isolated SOS gateway ingestion
│   │   ├── database/                  # SQLite connection & ORM models
│   │   ├── schemas/
│   │   │   ├── prediction.py          # Weather & flood estimation schemas
│   │   │   └── sos_proposal.py        # [PHASE 2 PROPOSAL] Versioned SOS message contract
│   │   └── services/
│   │       ├── weather_service.py     # Weather, GloFAS river, & tidal harmonics
│   │       ├── predictor_service.py   # Multi-model inference & Kerala rule engine
│   │       └── warning_engine.py      # Thresholding, cooldowns, & notifications
│   ├── requirements.txt
│   └── tests/                         # Full automated pytest test suite (22 passing)
│
├── frontend/                          # Operational Kerala Flood Intelligence Dashboard
│   ├── src/
│   │   ├── components/                # Map, cards, charts, alerts, modals
│   │   ├── services/api.ts            # Client API bindings
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json                   # React 19 + TypeScript + Vite
│   └── vite.config.ts
│
├── ml/                                # Machine Learning Pipelines & Artifacts
│   ├── artifacts/                     # Serialized pipelines (v1 & v2 joblib models)
│   ├── data/                          # Processed features and raw weather/river CSVs
│   ├── reports/                       # Data quality & evaluation benchmark reports
│   └── src/                           # Dataset builders & model trainers
│
├── ml_backup_karnataka/               # Immutable reference backup of Karnataka phase
│
├── apps/                              # [PHASE 2 PLANNED] Client Applications
│   └── citizen-android/               # Native Android SOS App (Kotlin / Jetpack Compose)
│       ├── app/src/main/
│       │   ├── java/org/resqnet/sos/  # Offline Room DB, Panic Button UI, GPS Listener
│       │   └── res/
│       └── build.gradle.kts
│
├── protocols/                         # [PHASE 2 PLANNED] Communication & Mesh Specifications
│   └── sos-mesh/                      # Store-and-forward mesh routing engine
│       ├── ble_advertiser.py/.kt      # Compact packet encoding (<512 bytes)
│       └── deduplication_cache.py     # Bloom filter & TTL packet dropping
│
└── dashboards/                        # [PHASE 3 PLANNED] Operational Command Portals
    └── rescuer-portal/                # Rescuer triage & resource dispatch console
```

---

## 3. Proposed Versioned SOS Message Contract

The SOS beacon contract is strictly decoupled from the live weather API and designed for extreme resource efficiency over Bluetooth Low Energy (BLE) and Wi-Fi Aware.

### JSON Schema Specification (`v1.0.0`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SOSMessageContract",
  "type": "object",
  "required": [
    "contract_version",
    "incident_id",
    "message_id",
    "created_at",
    "expires_at",
    "location",
    "severity",
    "delivery_status"
  ],
  "properties": {
    "contract_version": { "type": "string", "default": "1.0.0" },
    "incident_id": { "type": "string", "format": "uuid" },
    "message_id": { "type": "string", "format": "uuid" },
    "created_at": { "type": "string", "format": "date-time" },
    "expires_at": { "type": "string", "format": "date-time" },
    "location": {
      "type": "object",
      "required": ["latitude", "longitude", "accuracy_m"],
      "properties": {
        "latitude": { "type": "number", "minimum": -90.0, "maximum": 90.0 },
        "longitude": { "type": "number", "minimum": -180.0, "maximum": 180.0 },
        "altitude_m": { "type": ["number", "null"] },
        "accuracy_m": { "type": "number", "minimum": 0.0 },
        "provider": { "type": "string", "enum": ["gps", "fused", "network", "manual_override"] }
      }
    },
    "severity": {
      "type": "string",
      "enum": ["CRITICAL", "HIGH", "MODERATE", "LOW"]
    },
    "hazard_context": {
      "type": ["string", "null"],
      "enum": ["RIVERINE_INUNDATION", "FLASH_FLOOD", "LANDSLIDE_TRAPPED", "URBAN_WATERLOGGING", null]
    },
    "people_count": { "type": "integer", "minimum": 1, "maximum": 100, "default": 1 },
    "medical_assistance_required": { "type": "boolean", "default": false },
    "device_battery_pct": { "type": ["number", "null"], "minimum": 0.0, "maximum": 100.0 },
    "hop_count": { "type": "integer", "minimum": 0, "default": 0 },
    "max_hops": { "type": "integer", "minimum": 1, "maximum": 15, "default": 7 },
    "relay_history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["node_id_hash", "relayed_at"],
        "properties": {
          "node_id_hash": { "type": "string" },
          "relayed_at": { "type": "string", "format": "date-time" },
          "rssi_dbm": { "type": ["integer", "null"] },
          "transport": { "type": "string", "enum": ["BLE", "WIFI_AWARE", "LORA", "CELLULAR"] }
        }
      }
    },
    "delivery_status": {
      "type": "string",
      "enum": ["DRAFT", "QUEUED_OFFLINE", "RELAYING", "DELIVERED_BACKEND", "ACKNOWLEDGED_BY_RESCUER", "RESOLVED"]
    },
    "cryptographic_signature": { "type": ["string", "null"] }
  }
}
```

> [!IMPORTANT]
> **Implementation Note**: The programmatic Pydantic v2 implementation of this proposal is defined in `backend/app/schemas/sos_proposal.py`. It is isolated from production routes until cryptographic signing and gateway synchronizers are verified.

---

## 4. Planned Module Interfaces & Decoupling Strategy

To guarantee that the SOS mesh subsystem and the Flood Intelligence service remain fully decoupled, integration will occur through three explicit boundary adapters:

```
                                  [ Citizen Mobile Handset ]
                                              │
                                              ▼ (Store-and-Forward Mesh)
                                  [ Field Gateway Handset ]
                                              │
                                              ▼ (HTTPS POST on Cellular Restoration)
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           INTERFACE 1: GATEWAY INGESTION ADAPTER                           │
│                                                                                           │
│  Endpoint: POST /api/sos/v1/ingest                                                        │
│  Input: SOSMessageContract packet                                                         │
│  Responsibilities:                                                                        │
│  - Validate cryptographic signature                                                       │
│  - Deduplicate against known message_id in Redis/SQLite cache                             │
│  - Verify timestamp freshness (drop if past expires_at)                                   │
│  - Persist encrypted distress record                                                      │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                      INTERFACE 2: SPATIAL-HAZARD ENRICHMENT SERVICE                        │
│                                                                                           │
│  Function: HazardEnricher.enrich(latitude: float, longitude: float) -> HazardContext      │
│  Responsibilities:                                                                        │
│  - Read-only query into existing `PredictorService` & `geography_kerala.py`               │
│  - Locates nearest river basin (e.g., Periyar Basin) and CWC gauge danger distance        │
│  - Fetches active 24h rainfall probability & estuarine backwater threat                   │
│  - Returns strictly hydrologic context; NEVER accesses or persists victim PII             │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                     INTERFACE 3: TRIAGE & DISPATCH NOTIFIER ADAPTER                       │
│                                                                                           │
│  Channel: WebSocket / SSE to Rescuer Incident Command Portal                              │
│  Responsibilities:                                                                        │
│  - Computes combined Urgency Score = (Severity Weight * Hazard Risk * Medical Need)      │
│  - Pushes incident token to active rescue team queues                                     │
│  - Enables rescuer status acknowledgments (relayed back to mesh via return beacons)       │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Privacy, Security & Data Governance Rules

1. **Zero Personally Identifiable Information (PII) in Broadcasts**:  
   The SOS mesh beacon contains no citizen names, phone numbers, Aadhaar numbers, or device IMEI strings. Packets are identified solely by an ephemeral `incident_id` UUID.
2. **Ephemeral Time-to-Live (TTL)**:  
   Every beacon carries an explicit `expires_at` timestamp (default: 24 hours). Mesh relay nodes automatically delete expired packets from memory to prevent historical trajectory tracking.
3. **Truncated Node Hashes**:  
   Forwarding devices in `relay_history` record only a truncated 8-character SHA-256 hash of their ephemeral session ID, preventing mesh observers from constructing persistent citizen movement graphs.
4. **Repository Commit Safeguards**:  
   Under no circumstances shall real-world distress logs, GPS field traces, or incident transcripts be committed to Git. The root `.gitignore` enforces exclusion of `sos_logs/`, `incidents_private/`, and `*.gpx` files.
