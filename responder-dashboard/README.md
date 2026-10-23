# ResQNet — Rescuer & Incident Command Center

A high-performance, real-time tactical command dashboard for disaster response teams, rescue boat operators (NDRF, SDRF, Kerala Fishermen Rescue Fleet, Indian Coast Guard), and emergency incident commanders during flood emergencies in Kerala.

Built with **React + Vite + Leaflet**, this dashboard enables field coordinators to visualize flood inundation, monitor offline mesh-relayed distress beacons, prioritize vulnerable victims, and deploy rescue boats to nearest evacuation shelters.

---

## 1. Quickstart: Installation & Running

### Prerequisites
- **Node.js**: v18.0.0 or higher (LTS recommended)
- **npm**: v9.0.0 or higher

### Step-by-Step Launch
1. Open PowerShell / Terminal and navigate into the `responder-dashboard` directory:
   ```bash
   cd responder-dashboard
   ```

2. Install all dependencies:
   ```bash
   npm install
   ```

3. Configure environment settings:
   ```bash
   # On Windows PowerShell:
   Copy-Item .env.example .env

   # On Linux / macOS:
   cp .env.example .env
   ```

4. Launch the local Vite development server:
   ```bash
   npm run dev
   ```

5. Open your browser at **`http://localhost:5173`** (or the URL displayed in your terminal).

---

## 2. Mock Mode vs. Real Backend API Mode

The dashboard includes a decoupled dual-mode architecture:

| Feature / Mode | Mock / Simulation Mode (Default) | Real FastAPI Backend Mode |
| :--- | :--- | :--- |
| **Activation** | Leave `VITE_API_BASE_URL` empty in `.env` (or file omitted). | Set `VITE_API_BASE_URL=http://127.0.0.1:8000` in `.env`. |
| **Data Source** | Built-in Kerala Multi-District Simulator (`src/utils/keralaSimulator.js`). | Live FastAPI endpoints (`backend/app/api/`). |
| **Data Persistence** | Browser `localStorage` cache for boat dispatches, assignments, and triage status updates. | Backend SQLite / PostgreSQL database. |
| **Network Dependency** | Fully operational offline (only OpenStreetMap base tiles require internet; simulator runs 100% locally). | Requires local or remote FastAPI instance running. |
| **Fallback Resilience** | Always active as fallback if backend API encounters network latency or downtime. | Automatically falls back to simulator cache if API drops. |

> [!NOTE]
> Restart `npm run dev` after changing variables in `.env` for changes to take effect.

---

## 3. Implemented Features

### 🗺️ Interactive Leaflet Tactical Map
- **Live Spatial Incident Mapping**: Color-coded markers indicating triage urgency (Critical: Red, High: Orange, Medium: Yellow, Low: Blue, Rescued: Green).
- **Fleet Asset Tracking**: Visualizes active rescue boat units with availability badges (Available: Green, Dispatched: Amber, Under Maintenance: Gray).
- **Evacuation Shelters & Routing Vectors**: Displays designated community relief shelters across Kerala taluks, with dashed routing lines linking distressed victim clusters to their nearest safe evacuation point.
- **District Boundary Auto-Panning**: Seamlessly re-centers and zooms the viewport whenever a new district is selected.

### 🏛️ Kerala Multi-District Flood Scenario Sandbox
- **All 14 Revenue Districts Supported**: Ernakulam, Wayanad, Idukki, Alappuzha, Thrissur, Kottayam, Pathanamthitta, Kozhikode, Malappuram, Palakkad, Kannur, Kasaragod, Kollam, and Thiruvananthapuram.
- **High-Density Scenario Generation**: When a district is selected, the simulator generates **30–40 realistic distressed victim clusters** (35 by default) and **15 localized rescue boat assets** positioned along realistic riverbanks, estuaries, and low-lying taluks.
- **Dynamic Scenario Refresh**: One-click regeneration of flood scenarios to stress-test triage logic under varying rainfall and waterlevel conditions.

### 📋 Priority-Ranked SOS Triage Worklist
- **Multi-Factor Urgency Scoring**: Algorithmically ranks incidents by combining severity level, water depth, trapped structural state, medical emergencies, vulnerable occupants (infants, elderly, pregnant), and Bluetooth LE store-and-forward mesh hop counts.
- **Multi-Dimensional Filters**: Instantly filter triage queues by:
  - Kerala District
  - Urgency Tier (`All`, `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)
  - Response Lifecycle State (`All`, `Pending`, `Assigned`, `Rescued`)
  - Free-text search across incident description, location name, and reporter ID.

### 🚤 Rescue Boat Fleet & Task Assignment Console
- **Interactive Dispatch Workflow**: Click the **"🚤 Deploy / Assign Rescue Boat"** button on any SOS incident card to open the dedicated fleet dispatch console.
- **Vessel Telemetry & Onboard Gear**: Displays vessel name, operator call sign, vessel type (NDRF Inflatable, Kerala Fishermen FRP Motorboat, Coast Guard Jet, etc.), seating capacity, crew count, and equipment badges (Life Jackets, Trauma Kits, Satellite Phones, Heavy Winches).
- **Target Capacity Validation**: Verifies that the selected rescue vessel has sufficient passenger capacity for the reported group size.
- **Persistent Database State Sync**: Dispatches update the boat's status to `in_transit` / `busy`, record the assigned incident token, update the SOS ticket from `pending` to `assigned`, and persist changes in the client database so other panels immediately reflect the dispatch.

### 🔄 End-to-End Status Lifecycle
- Responders can advance any incident through its complete operational cycle:
  `pending` ➔ `assigned` ➔ `in_transit` ➔ `rescued` ➔ `resolved`.

### 📢 Emergency Early-Warning Broadcasts
- Integrated dispatch modal allowing incident commanders to compose and publish geofenced siren alerts and evacuation bulletins across affected revenue divisions.

---

## 4. Expected Backend API Contract

When connected to the FastAPI backend (`VITE_API_BASE_URL`), the dashboard interacts with the following endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sos` | List active distress beacons (supports query params: `district`, `status`, `limit`). |
| `GET` | `/api/risk` | Retrieve flood inundation risk zones and hydrometeorological threat levels. |
| `GET` | `/api/alerts` | List historical and active public emergency bulletins. |
| `PATCH` | `/api/sos/{id}/status` | Update incident status (`assigned`, `in_transit`, `rescued`). |
| `POST` | `/api/alerts` | Broadcast a new emergency warning alert. |

---

## 5. Directory Structure

```
responder-dashboard/
├── .env.example                       # Environment template (NO SECRETS)
├── .gitignore                         # Excludes node_modules, build dirs, and .env
├── index.html                         # Application entrypoint & meta tags
├── package.json                       # Dependencies & build scripts
├── README.md                          # This documentation file
│
└── src/
    ├── main.jsx                       # React DOM root mounting
    ├── App.jsx                        # Master command center & incident triage views
    ├── api.js                         # API service with dual-mode fallback & persistence
    ├── mockData.js                    # Base fictional telemetry fixtures
    ├── styles.css                     # Premium dark-mode glassmorphic styling
    │
    ├── components/
    │   └── RescueFleetDashboard.jsx   # Dedicated Boat Fleet & Dispatch modal
    │
    └── utils/
        ├── geo.js                     # Spatial distance & bounding calculations
        ├── keralaDistricts.js         # Kerala 14 revenue district coordinates & metadata
        └── keralaSimulator.js         # Dynamic 35-victim & 15-boat scenario generator
```

---

## 6. Security & Responsible Use Notice
- **Zero Secrets in Repository**: `.env` is ignored by Git. Only non-sensitive `.env.example` templates are tracked.
- **PII Protection**: Demonstration SOS records, phone numbers, and citizen names are fictional and generated purely for disaster-response simulation.
- **Decision Support**: This software is designed as an operational decision-support tool and should be operated by authorized disaster management personnel in accordance with official KSDMA / NDRF protocols.
