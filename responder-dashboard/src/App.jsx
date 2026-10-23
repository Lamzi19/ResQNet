import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  assignBoatToIncident,
  completeRescueMission,
  createAlert,
  getAlerts,
  getDistrictScenarioData,
  updateBoatStatus,
  updateIncidentStatus,
} from "./api";
import RescueFleetDashboard from "./components/RescueFleetDashboard";
import { KERALA_DISTRICTS, getDistrictById } from "./utils/keralaDistricts";

const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
const COLORS = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
  UNKNOWN: "#94a3b8",
};
const statusOptions = ["unassigned", "assigned", "rescued", "closed"];

function normalizeIncident(x) {
  const score = Number(x.priority_score ?? x.urgency_score ?? 0);
  const level = String(x.priority_level || x.urgency_level || levelFromScore(score)).toUpperCase();
  return {
    ...x,
    id: String(x.id ?? x.sos_id ?? "unknown"),
    district_id: x.district_id || "ernakulam",
    district_name: x.district_name || "Kerala",
    latitude: Number(x.latitude ?? x.lat),
    longitude: Number(x.longitude ?? x.lng ?? x.lon),
    priority_score: score,
    priority_level: LEVELS.includes(level) ? level : "UNKNOWN",
    response_status: String(x.response_status ?? x.status ?? "unassigned").toLowerCase(),
    assigned_boat_id: x.assigned_boat_id || null,
    assigned_boat_name: x.assigned_boat_name || null,
    mission_phase: x.mission_phase || null,
    priority_reasons: Array.isArray(x.priority_reasons)
      ? x.priority_reasons
      : Array.isArray(x.reasons)
      ? x.reasons
      : [],
    people_count: Number(x.people_count ?? x.people_affected ?? 1),
  };
}

function levelFromScore(score) {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function timeAgo(date) {
  if (!date) return "Time unknown";
  const t = typeof date === "number" ? date : new Date(date).getTime();
  if (!Number.isFinite(t)) return "Time unknown";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return mins < 1 ? "Just now" : `${mins}m ago`;
}

// Custom Leaflet DivIcon for Evacuation Shelter
function createShelterIcon() {
  return L.divIcon({
    className: "custom-shelter-map-pin",
    html: `
      <div style="
        background: #8b5cf6;
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 10px rgba(139,92,246,0.6);
        cursor: pointer;
      " title="Allocated Evacuation Center / Relief Shelter">
        ⛺
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -15],
  });
}

// Custom Leaflet DivIcon for rescue boats on Command Center map
function createBoatMapIcon(status) {
  const bg = status === "available" ? "#10b981" : status === "deployed" ? "#f59e0b" : "#64748b";
  return L.divIcon({
    className: "custom-boat-map-pin-small",
    html: `
      <div style="
        background: ${bg};
        color: #ffffff;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        border: 2px solid #ffffff;
        box-shadow: 0 3px 8px rgba(0,0,0,0.5);
        cursor: pointer;
      " title="Rescue Vessel (${status})">
        🚤
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

// Map pan/zoom controller
function KeralaMapController({ district, selectedIncident }) {
  const map = useMap();
  useEffect(() => {
    if (selectedIncident && Number.isFinite(selectedIncident.latitude) && Number.isFinite(selectedIncident.longitude)) {
      map.setView([selectedIncident.latitude, selectedIncident.longitude], 13, { animate: true });
    } else if (district) {
      map.setView(district.center, district.zoom, { animate: true });
    }
  }, [district, selectedIncident, map]);
  return null;
}

function Stat({ label, value, detail, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}

function PriorityPill({ level }) {
  return (
    <span className={`priority-pill ${level.toLowerCase()}`}>
      <i />
      {level}
    </span>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("command"); // 'command' | 'fleet'
  const [selectedDistrictId, setSelectedDistrictId] = useState("ernakulam");
  const [incidents, setIncidents] = useState([]);
  const [boats, setBoats] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [targetedIncidentId, setTargetedIncidentId] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showRisk, setShowRisk] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showBoatsOnMap, setShowBoatsOnMap] = useState(true);
  const [query, setQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [apiState, setApiState] = useState("loading");
  const [error, setError] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertArea, setAlertArea] = useState("Ernakulam Periyar Basin");
  const [alertSeverity, setAlertSeverity] = useState("WARNING");
  const [alertMessage, setAlertMessage] = useState(
    "Urgent flood alert: Water release from upstream dams. Riverbank settlements in low-lying wards advised to evacuate to nearest shelters immediately."
  );
  const [alertSending, setAlertSending] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState("");

  const currentDistrict = useMemo(
    () => getDistrictById(selectedDistrictId),
    [selectedDistrictId]
  );

  // Load district flood scenario (30-40 victims, 15 boats, allocated evacuation shelters)
  const loadDistrictScenario = useCallback(async (districtId, forceRegenerate = false) => {
    try {
      const data = await getDistrictScenarioData(districtId, forceRegenerate);
      const rawAlerts = await getAlerts();

      const normalized = (data.incidents || [])
        .map(normalizeIncident)
        .filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));

      setIncidents(normalized);
      setBoats(data.boats || []);
      setShelters(data.shelters || []);
      setRiskZones(data.riskZones || []);
      setAlerts(rawAlerts || []);
      setLastUpdated(new Date());
      setApiState(import.meta.env.VITE_API_BASE_URL ? "connected" : "demo");
      setError("");
      setSelectedId((curr) =>
        curr && normalized.some((x) => x.id === curr) ? curr : normalized[0]?.id ?? null
      );
      setAlertArea(`${data.district.shortName} Flood Inundation Sector`);
    } catch (e) {
      setApiState("error");
      setError(e.message || "Failed to load district scenario data.");
    }
  }, []);

  // Reload when selected district changes
  useEffect(() => {
    loadDistrictScenario(selectedDistrictId, false);
  }, [selectedDistrictId, loadDistrictScenario]);

  // Periodic polling
  useEffect(() => {
    const timer = setInterval(() => {
      loadDistrictScenario(selectedDistrictId, false);
    }, 20000);
    return () => clearInterval(timer);
  }, [selectedDistrictId, loadDistrictScenario]);

  // Re-roll fresh random flood scenario for current district
  const handleRegenerateScenario = () => {
    loadDistrictScenario(selectedDistrictId, true);
    setAlertFeedback(`🎲 Generated fresh flood simulation for ${currentDistrict.name}: 35 Victims & 15 Rescue Boats randomized.`);
  };

  // Filtered incidents for Command Center triage worklist
  const visible = useMemo(
    () =>
      incidents
        .filter((x) => filter === "ALL" || x.priority_level === filter)
        .filter((x) =>
          statusFilter === "all"
            ? true
            : statusFilter === "active"
            ? !["rescued", "closed"].includes(x.response_status)
            : x.response_status === statusFilter
        )
        .filter((x) =>
          `${x.id} ${x.description || ""} ${x.location_name || ""} ${x.assigned_boat_name || ""}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .sort(
          (a, b) =>
            b.priority_score - a.priority_score ||
            new Date(a.created_at || 0) - new Date(b.created_at || 0)
        ),
    [incidents, filter, statusFilter, query]
  );

  const selected = incidents.find((x) => x.id === selectedId) || null;

  // Selected incident's currently assigned boat object (if any)
  const selectedAssignedBoat = useMemo(() => {
    if (!selected) return null;
    return (
      boats.find(
        (b) =>
          b.id === selected.assigned_boat_id ||
          b.assigned_incident_id === selected.id ||
          (selected.assigned_boat_name && b.name === selected.assigned_boat_name)
      ) || null
    );
  }, [selected, boats]);

  // Nearest allocated shelter for selected incident
  const nearestShelter = useMemo(() => {
    if (!selected || shelters.length === 0) return null;
    return shelters[0];
  }, [selected, shelters]);

  const counts = useMemo(
    () => ({
      total: incidents.length,
      critical: incidents.filter(
        (x) => x.priority_level === "CRITICAL" && !["rescued", "closed"].includes(x.response_status)
      ).length,
      awaiting: incidents.filter((x) => ["unassigned", "pending"].includes(x.response_status)).length,
      assigned: incidents.filter((x) => x.response_status === "assigned").length,
      rescued: incidents.filter((x) => x.response_status === "rescued").length,
      availableBoats: boats.filter((b) => b.status === "available").length,
      deployedBoats: boats.filter((b) => b.status === "deployed").length,
    }),
    [incidents, boats]
  );

  const chartData = useMemo(
    () =>
      LEVELS.slice(0, 4).map((level) => ({
        level,
        cases: incidents.filter((x) => x.priority_level === level).length,
      })),
    [incidents]
  );

  // --- Handlers ---
  const handleGoToBoatAssignment = (incidentId) => {
    setTargetedIncidentId(incidentId);
    setSelectedId(incidentId);
    setActiveTab("fleet");
  };

  const handleAssignBoat = async (boatId, incidentId) => {
    const boat = boats.find((b) => b.id === boatId);
    if (!boat) return;

    try {
      const res = await assignBoatToIncident(boatId, incidentId, selectedDistrictId);
      if (res && res.scenario) {
        setBoats(res.scenario.boats);
        setIncidents(res.scenario.incidents.map(normalizeIncident));
      }
      setAlertFeedback(`🚤 Dispatched "${boat.name}" to SOS #${incidentId}! Database updated.`);
      setTargetedIncidentId(null);
    } catch (e) {
      setError(`Assignment failed: ${e.message}`);
    }
  };

  const handleUnassignBoat = async (boatId, incidentId) => {
    const boat = boats.find((b) => b.id === boatId);
    try {
      const res = await updateIncidentStatus(incidentId, "unassigned", selectedDistrictId);
      if (res && res.scenario) {
        setBoats(res.scenario.boats);
        setIncidents(res.scenario.incidents.map(normalizeIncident));
      }
      setAlertFeedback(`Vessel "${boat?.name || boatId}" recalled to base and is now AVAILABLE.`);
    } catch (e) {
      setError(`Recall failed: ${e.message}`);
    }
  };

  const handleUpdateBoatPhase = async (boatId, newPhase) => {
    try {
      const res = await updateBoatStatus(boatId, "deployed", selectedDistrictId, newPhase);
      if (res && res.scenario) {
        setBoats(res.scenario.boats);
        setIncidents(res.scenario.incidents.map(normalizeIncident));
      }
      setAlertFeedback(`Updated mission phase to "${newPhase.replace("_", " ").toUpperCase()}".`);
    } catch (e) {
      setError(`Phase update failed: ${e.message}`);
    }
  };

  const handleMarkRescued = async (boatId, incidentId) => {
    const targetInc = incidents.find((x) => x.id === incidentId);
    const peopleSaved = targetInc?.people_count || 1;
    const targetBoat = boats.find((b) => b.id === boatId);

    try {
      const res = await completeRescueMission(boatId, incidentId, selectedDistrictId);
      if (res && res.scenario) {
        setBoats(res.scenario.boats);
        setIncidents(res.scenario.incidents.map(normalizeIncident));
      }
      setAlertFeedback(
        `🎉 Mission complete! ${peopleSaved} people evacuated and marked rescued for Case #${incidentId}. ${
          targetBoat?.name ? `"${targetBoat.name}" is now ready for new tasks.` : ""
        }`
      );
    } catch (e) {
      setError(`Mark rescued failed: ${e.message}`);
    }
  };

  const handleToggleMaintenance = async (boatId) => {
    const b = boats.find((x) => x.id === boatId);
    const nextStatus = b?.status === "maintenance" ? "available" : "maintenance";
    const res = await updateBoatStatus(boatId, nextStatus, selectedDistrictId);
    if (res && res.scenario) {
      setBoats(res.scenario.boats);
    }
    setAlertFeedback(`Vessel "${b?.name}" status updated to ${nextStatus.toUpperCase()}.`);
  };

  async function changeStatus(incident, status) {
    try {
      const res = await updateIncidentStatus(incident.id, status, selectedDistrictId);
      if (res && res.scenario) {
        setIncidents(res.scenario.incidents.map(normalizeIncident));
        setBoats(res.scenario.boats);
      }
    } catch (e) {
      setError(`Status update failed: ${e.message}`);
    }
  }

  async function submitAlert(e) {
    e.preventDefault();
    if (!alertMessage.trim()) return;
    setAlertSending(true);
    setAlertFeedback("");
    try {
      const result = await createAlert({
        area: alertArea,
        severity: alertSeverity,
        message: alertMessage.trim(),
        created_at: new Date().toISOString(),
        source: "responder_dashboard",
      });
      setAlerts((old) => [result, ...old]);
      setAlertFeedback(`Alert successfully broadcasted to ${alertArea}.`);
      setAlertOpen(false);
    } catch (e) {
      setAlertFeedback(`Alert request failed: ${e.message}`);
    } finally {
      setAlertSending(false);
    }
  }

  return (
    <div className="app-shell">
      {/* Top Bar with Navigation Tabs & Kerala District Selector */}
      <header className="topbar">
        <div className="brand-mark">
          R<span>Q</span>
        </div>
        <div className="brand-copy">
          <div className="brand-title">
            ResQNet <span>KERALA FLOOD COMMAND</span>
          </div>
          <div className="brand-subtitle">Simulated flood scenario · dynamic victim clusters &amp; boat fleet dispatch</div>
        </div>

        {/* Primary Page Navigation Tabs */}
        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab-btn ${activeTab === "command" ? "active" : ""}`}
            onClick={() => setActiveTab("command")}
          >
            <span className="tab-icon">📍</span> Command Center
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "fleet" ? "active" : ""}`}
            onClick={() => setActiveTab("fleet")}
          >
            <span className="tab-icon">🚤</span> Rescue Fleet &amp; Dispatch
            <span className="tab-fleet-badge">{counts.availableBoats} Ready</span>
          </button>
        </nav>

        {/* District Selector & Scenario Generator Control */}
        <div className="topbar-district-wrap">
          <label className="topbar-district-label">DISTRICT:</label>
          <select
            className="topbar-district-select"
            value={selectedDistrictId}
            onChange={(e) => {
              setSelectedDistrictId(e.target.value);
              setSelectedId(null);
              setTargetedIncidentId(null);
            }}
          >
            {KERALA_DISTRICTS.filter((d) => d.id !== "all").map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <button
            className="button-reroll-scenario"
            onClick={handleRegenerateScenario}
            title="Randomize new fake flood scenario with 35 victims and 15 boats for this district"
          >
            🎲 Re-Simulate Flood
          </button>
        </div>

        <div className="top-actions">
          <span className={`connection ${apiState}`}>
            <i />
            {apiState === "connected"
              ? "API connected"
              : apiState === "demo"
              ? "SIMULATOR ACTIVE"
              : apiState === "loading"
              ? "Connecting"
              : "API error"}
          </span>
          <button className="button secondary" onClick={() => loadDistrictScenario(selectedDistrictId, false)} title="Re-sync data">
            ↻ Sync
          </button>
          <button
            className="button primary"
            onClick={() => {
              setAlertFeedback("");
              setAlertOpen(true);
            }}
          >
            ＋ Broadcast alert
          </button>
        </div>
      </header>

      {/* Kerala District Scenario Context Banner */}
      <div className="kerala-district-info-banner">
        <span className="district-pin">🌊</span>
        <div>
          <strong>{currentDistrict.name} Flood Scenario Active:</strong>{" "}
          <span className="district-stats-pill">{incidents.length} Distress Reports (Victims)</span> ·{" "}
          <span className="district-stats-pill">{boats.length} Rescue Vessels Allocated</span> ·{" "}
          <span className="district-stats-pill">{shelters.length} Evacuation Camps Assigned</span>
          <div className="district-desc" style={{ marginTop: 3 }}>
            Catchment: {currentDistrict.floodZone}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Data connection issue:</strong> {error}{" "}
          <button onClick={() => loadDistrictScenario(selectedDistrictId, false)}>Retry</button>
        </div>
      )}

      {/* VIEW 1: Command Center View */}
      {activeTab === "command" && (
        <main className="dashboard">
          <section className="stats-grid">
            <Stat
              label={`TOTAL VICTIMS (${currentDistrict.shortName.toUpperCase()})`}
              value={counts.total}
              detail="Randomized distress reports"
            />
            <Stat
              label="CRITICAL EVACUATION"
              value={counts.critical}
              detail="Water rising / children / injured"
              tone="danger"
            />
            <Stat
              label="AWAITING RESCUE VESSEL"
              value={counts.awaiting}
              detail="Pending boat assignment"
              tone="warning"
            />
            <Stat
              label="DISTRICT RESCUE FLEET"
              value={`${counts.deployedBoats} deployed / ${counts.availableBoats} available`}
              detail={`${boats.length} total boats allocated`}
              tone="success"
            />
          </section>

          <section className="main-grid">
            {/* Map Panel */}
            <div className="panel map-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">DISTRICT GEOSPATIAL OVERVIEW · {currentDistrict.shortName.toUpperCase()}</div>
                  <h2>{currentDistrict.name} Flood Scenario Map</h2>
                  <p>Displaying {incidents.length} victims (●), {boats.length} rescue vessels (🚤), and {shelters.length} evacuation shelters (⛺).</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showShelters}
                      onChange={(e) => setShowShelters(e.target.checked)}
                    />{" "}
                    Evacuation shelters (⛺)
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showBoatsOnMap}
                      onChange={(e) => setShowBoatsOnMap(e.target.checked)}
                    />{" "}
                    Rescue boats (🚤)
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={showRisk}
                      onChange={(e) => setShowRisk(e.target.checked)}
                    />{" "}
                    Flood basin
                  </label>
                </div>
              </div>

              <div className="map-wrap" style={{ height: 460 }}>
                <MapContainer
                  center={currentDistrict.center}
                  zoom={currentDistrict.zoom}
                  scrollWheelZoom
                  className="leaflet-map"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <KeralaMapController district={currentDistrict} selectedIncident={selected} />

                  {/* Flood Risk Zones */}
                  {showRisk &&
                    riskZones.map((zone) => (
                      <Circle
                        key={zone.id}
                        center={[Number(zone.latitude), Number(zone.longitude)]}
                        radius={Number(zone.radius_m || 1800)}
                        pathOptions={{
                          color: zone.risk_level === "HIGH" ? "#dc2626" : "#d97706",
                          fillColor: zone.risk_level === "HIGH" ? "#ef4444" : "#f59e0b",
                          fillOpacity: 0.14,
                          weight: 2,
                        }}
                      >
                        <Popup>
                          <strong>{zone.name}</strong>
                          <br />
                          Flood Inundation Core · Risk: {zone.risk_level}
                        </Popup>
                      </Circle>
                    ))}

                  {/* Allocated Evacuation Shelters / Relief Camps */}
                  {showShelters &&
                    shelters.map((shelter) => (
                      <Marker
                        key={shelter.id}
                        position={[shelter.latitude, shelter.longitude]}
                        icon={createShelterIcon()}
                      >
                        <Popup>
                          <div className="map-shelter-popup">
                            <strong>⛺ {shelter.name}</strong>
                            <div style={{ color: "#8b5cf6", fontWeight: 700, margin: "2px 0" }}>
                              Allocated Evacuation Relief Camp
                            </div>
                            <div>
                              Capacity: <strong>{shelter.capacity} persons</strong> (
                              {shelter.occupied} occupied · {shelter.available_space} spots free)
                            </div>
                            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                              Facilities: {shelter.facilities.join(", ")}
                            </div>
                            <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
                              Camp Officer: {shelter.camp_officer}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                  {/* Rescue Boats on Map */}
                  {showBoatsOnMap &&
                    boats.map((b) => {
                      if (!Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return null;
                      const assignedInc = b.assigned_incident_id
                        ? incidents.find((x) => x.id === b.assigned_incident_id)
                        : null;

                      return (
                        <React.Fragment key={b.id}>
                          <Marker
                            position={[b.latitude, b.longitude]}
                            icon={createBoatMapIcon(b.status)}
                          >
                            <Popup>
                              <div className="map-boat-popup">
                                <strong>🚤 {b.name}</strong>
                                <div className="popup-agency">{b.agency}</div>
                                <div className={`popup-status ${b.status}`}>
                                  STATUS: {b.status.toUpperCase()}
                                </div>
                                <div>Capacity: {b.capacity} Persons</div>
                                <div>Commander: {b.commander}</div>
                                <div>Dock: {b.base_name}</div>
                                {b.assigned_incident_id && (
                                  <div className="popup-assigned">
                                    Assigned to: <strong>{b.assigned_incident_id}</strong>
                                  </div>
                                )}
                              </div>
                            </Popup>
                          </Marker>

                          {/* Connecting Polyline to assigned victim */}
                          {assignedInc && (
                            <Polyline
                              positions={[
                                [b.latitude, b.longitude],
                                [assignedInc.latitude, assignedInc.longitude],
                              ]}
                              pathOptions={{
                                color: "#f59e0b",
                                weight: 3,
                                dashArray: "5, 7",
                                opacity: 0.85,
                              }}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}

                  {/* Victims / SOS Distress Markers (30-40 clustered across district) */}
                  {visible.map((x) => (
                    <CircleMarker
                      key={x.id}
                      center={[x.latitude, x.longitude]}
                      radius={x.id === selectedId ? 11 : 7}
                      pathOptions={{
                        color: x.assigned_boat_name ? "#38bdf8" : "#f8fafc",
                        weight: x.id === selectedId ? 3 : 2,
                        fillColor: COLORS[x.priority_level],
                        fillOpacity: 0.95,
                      }}
                      eventHandlers={{ click: () => setSelectedId(x.id) }}
                    >
                      <Popup>
                        <strong>{x.id}</strong> ({x.priority_level})
                        <br />
                        <strong>{x.people_count} People Stranded</strong>
                        <br />
                        {x.location_name}
                        <br />
                        &ldquo;{x.description}&rdquo;
                        {x.assigned_boat_name && (
                          <div style={{ color: "#38bdf8", fontWeight: 700, marginTop: 4 }}>
                            🚤 Assigned: {x.assigned_boat_name}
                          </div>
                        )}
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>

              <div className="map-footer">
                <div className="legend">
                  {LEVELS.slice(0, 4).map((level) => (
                    <span key={level}>
                      <i style={{ background: COLORS[level] }} />
                      {level}
                    </span>
                  ))}
                  <span><i style={{ background: "#8b5cf6", borderRadius: 3 }} /> Evacuation Camp</span>
                  <span><i style={{ background: "#10b981" }} /> Available Boat</span>
                  <span><i style={{ background: "#f59e0b" }} /> Boat Deployed</span>
                </div>
                <span className="muted small">
                  {visible.length} victims · {boats.length} boats · {shelters.length} evacuation shelters active
                </span>
              </div>
            </div>

            {/* Selected Incident Detail Panel */}
            <aside className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">SELECTED SOS CASE · {currentDistrict.shortName.toUpperCase()}</div>
                  <h2>{selected?.id || "No case selected"}</h2>
                </div>
              </div>
              {selected ? (
                <div className="detail-content">
                  <div className="detail-top">
                    <PriorityPill level={selected.priority_level} />
                    <strong className="score">
                      {selected.priority_score}
                      <small>/100</small>
                    </strong>
                  </div>
                  <p className="description">
                    {selected.description || selected.category || "No description provided."}
                  </p>
                  <div className="detail-grid">
                    <div>
                      <span>LOCATION IN {currentDistrict.shortName.toUpperCase()}</span>
                      <strong>{selected.location_name}</strong>
                    </div>
                    <div>
                      <span>PEOPLE AFFECTED</span>
                      <strong>{selected.people_count}</strong>
                    </div>
                    <div>
                      <span>REPORTED</span>
                      <strong>{timeAgo(selected.created_at)}</strong>
                    </div>
                    <div>
                      <span>COORDINATES</span>
                      <strong>{selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</strong>
                    </div>
                    <div>
                      <span>DELIVERY</span>
                      <strong>{selected.delivery_status || "Received"}</strong>
                    </div>
                    <div>
                      <span>VULNERABILITY</span>
                      <strong>
                        {(selected.vulnerability_flags || []).join(", ") || "None"}
                      </strong>
                    </div>
                  </div>

                  {/* Allocated Evacuation Shelter Banner */}
                  {nearestShelter && (
                    <div className="allocated-shelter-box">
                      <div className="shelter-box-title">
                        <span>⛺ ALLOCATED EVACUATION CAMP</span>
                        <span className="shelter-capacity-pill">{nearestShelter.available_space} spots free</span>
                      </div>
                      <strong>{nearestShelter.name}</strong>
                      <div className="shelter-facilities">
                        Facilities: {nearestShelter.facilities.join(" · ")}
                      </div>
                    </div>
                  )}

                  <div className="reasons">
                    <h3>Why this priority?</h3>
                    {selected.priority_reasons.length ? (
                      <ul>
                        {selected.priority_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">Severe water rise reported.</p>
                    )}
                  </div>

                  {/* Rescue Boat Task Assignment Card */}
                  <div className="incident-assignment-card">
                    <div className="assignment-card-header">
                      <span className="field-label">RESCUE BOAT ASSIGNMENT</span>
                      <span className={`status-badge-pill ${selected.response_status}`}>
                        {selected.response_status === "assigned"
                          ? "● BOAT ASSIGNED"
                          : selected.response_status === "rescued"
                          ? "✓ RESCUED"
                          : selected.response_status === "closed"
                          ? "CLOSED"
                          : "UNASSIGNED"}
                      </span>
                    </div>

                    {/* Unassigned */}
                    {selected.response_status === "unassigned" && (
                      <div className="assignment-unassigned-box">
                        <p className="assignment-prompt-text">
                          {selected.people_count} person(s) stranded. Select a rescue boat from the {currentDistrict.shortName} fleet to dispatch.
                        </p>
                        <button
                          className="button primary full assign-boat-trigger-btn"
                          onClick={() => handleGoToBoatAssignment(selected.id)}
                        >
                          🚤 Deploy / Assign Rescue Boat
                        </button>
                      </div>
                    )}

                    {/* Assigned */}
                    {selected.response_status === "assigned" && (
                      <div className="assignment-assigned-box">
                        <div className="assigned-boat-meta">
                          <div className="assigned-boat-title">
                            🚤 <strong>{selected.assigned_boat_name || selectedAssignedBoat?.name || "Rescue Vessel"}</strong>
                          </div>
                          {selectedAssignedBoat && (
                            <div className="assigned-boat-agency">{selectedAssignedBoat.agency}</div>
                          )}
                          <div className="assigned-mission-phase">
                            Status:{" "}
                            <span className="phase-indicator">
                              {(selected.mission_phase || selectedAssignedBoat?.mission_phase || "en_route")
                                .replace("_", " ")
                                .toUpperCase()}
                            </span>
                          </div>
                          {selectedAssignedBoat?.commander && (
                            <div className="assigned-boat-commander">
                              Cmdr: {selectedAssignedBoat.commander} · {selectedAssignedBoat.contact}
                            </div>
                          )}
                        </div>

                        <div className="assigned-actions-cluster">
                          <button
                            className="button primary full"
                            onClick={() =>
                              handleMarkRescued(
                                selected.assigned_boat_id || selectedAssignedBoat?.id,
                                selected.id
                              )
                            }
                          >
                            ✓ Mark Rescued &amp; Complete
                          </button>
                          <div className="assigned-secondary-actions">
                            <button
                              className="button secondary"
                              onClick={() => handleGoToBoatAssignment(selected.id)}
                            >
                              Reassign / View Fleet
                            </button>
                            <button
                              className="button secondary"
                              onClick={() =>
                                handleUnassignBoat(
                                  selected.assigned_boat_id || selectedAssignedBoat?.id,
                                  selected.id
                                )
                              }
                            >
                              Recall Vessel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rescued */}
                    {selected.response_status === "rescued" && (
                      <div className="assignment-rescued-box">
                        <p className="rescued-banner-text">
                          ✓ All {selected.people_count} affected persons successfully evacuated and transferred to relief shelter.
                        </p>
                        <button
                          className="button secondary full"
                          style={{ marginTop: 6, fontSize: 11 }}
                          onClick={() => changeStatus(selected, "unassigned")}
                        >
                          Reopen Case
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    className="button secondary full"
                    style={{ marginTop: 10 }}
                    onClick={() => setSelectedId(selected.id)}
                  >
                    Keep selected on map
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ padding: 18 }}>
                  Select an incident from the map or triage worklist.
                </p>
              )}
            </aside>
          </section>

          {/* Bottom Grid: Triage Worklist & Situation Snapshot */}
          <section className="bottom-grid">
            <div className="panel queue-panel">
              <div className="panel-heading queue-heading">
                <div>
                  <div className="eyebrow">TRIAGE WORKLIST · {currentDistrict.shortName.toUpperCase()} FLOOD SCENARIO</div>
                  <h2>Ranked Distress Queue ({visible.length} victims)</h2>
                  <p>Sorted by priority score. High urgency extraction cases prioritized.</p>
                </div>
                <span className="count-badge">{visible.length} cases</span>
              </div>

              <div className="filters">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search case ID, locality, boat or description…"
                  aria-label="Search SOS cases"
                />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Filter priority"
                >
                  <option value="ALL">All priorities</option>
                  {LEVELS.slice(0, 4).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter status"
                >
                  <option value="active">Active cases</option>
                  <option value="all">All statuses</option>
                  {statusOptions.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CASE &amp; LOCALITY</th>
                      <th>PRIORITY</th>
                      <th>SCORE</th>
                      <th>PEOPLE</th>
                      <th>REPORTED</th>
                      <th>RESPONSE STATUS</th>
                      <th>TASK ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((x) => (
                      <tr
                        key={x.id}
                        className={selectedId === x.id ? "selected-row" : ""}
                        onClick={() => setSelectedId(x.id)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelectedId(x.id);
                        }}
                      >
                        <td>
                          <strong>{x.id}</strong>
                          <span className="table-description">{x.location_name} - {x.description}</span>
                        </td>
                        <td>
                          <PriorityPill level={x.priority_level} />
                        </td>
                        <td>
                          <strong>{x.priority_score}</strong>
                        </td>
                        <td>{x.people_count}</td>
                        <td>{timeAgo(x.created_at)}</td>
                        <td>
                          <div className="queue-status-cell">
                            <span className={`status-text ${x.response_status}`}>
                              {x.response_status}
                            </span>
                            {x.assigned_boat_name && (
                              <span className="queue-boat-tag" title="Assigned Rescue Vessel">
                                🚤 {x.assigned_boat_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {x.response_status === "assigned" ? (
                            <button
                              className="queue-action-btn assigned"
                              onClick={() => handleGoToBoatAssignment(x.id)}
                            >
                              Manage Boat
                            </button>
                          ) : x.response_status === "rescued" ? (
                            <span className="queue-rescued-tag">✓ Rescued</span>
                          ) : (
                            <button
                              className="queue-action-btn dispatch"
                              onClick={() => handleGoToBoatAssignment(x.id)}
                            >
                              Assign Boat
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visible.length === 0 && (
                  <div className="empty-state">No reports match these filters.</div>
                )}
              </div>
            </div>

            <div className="panel analytics-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">{currentDistrict.shortName.toUpperCase()} SITUATION SNAPSHOT</div>
                  <h2>Distress Cases by Priority</h2>
                  <p>Distribution across {incidents.length} simulated flood victims.</p>
                </div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#273543" />
                    <XAxis dataKey="level" tick={{ fontSize: 10, fill: "#9aabba" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9aabba" }} />
                    <Tooltip
                      contentStyle={{
                        background: "#111d27",
                        border: "1px solid #344452",
                        borderRadius: 8,
                        color: "#f8fafc",
                      }}
                    />
                    <Bar dataKey="cases" name="Cases" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="broadcast-summary">
                <div>
                  <span className="eyebrow">DISTRICT FLEET READINESS</span>
                  <strong>
                    {counts.availableBoats} of {boats.length} Boats Available
                  </strong>
                  <p>
                    {counts.deployedBoats > 0
                      ? `${counts.deployedBoats} rescue vessel(s) deployed in ${currentDistrict.shortName}.`
                      : `All ${boats.length} boats ready for tasking in ${currentDistrict.shortName}.`}
                  </p>
                </div>
                <button className="button secondary" onClick={() => setActiveTab("fleet")}>
                  Fleet Dashboard
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* VIEW 2: Dedicated Rescue Boat Fleet & Assignment Dashboard */}
      {activeTab === "fleet" && (
        <RescueFleetDashboard
          boats={boats}
          incidents={incidents}
          targetedIncidentId={targetedIncidentId}
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={setSelectedDistrictId}
          onClearTargetIncident={() => setTargetedIncidentId(null)}
          onAssignBoat={handleAssignBoat}
          onUnassignBoat={handleUnassignBoat}
          onUpdateBoatPhase={handleUpdateBoatPhase}
          onMarkRescued={handleMarkRescued}
          onToggleMaintenance={handleToggleMaintenance}
          onNavigateToCommandCenter={() => setActiveTab("command")}
          onSelectIncident={(id) => {
            setSelectedId(id);
            setActiveTab("command");
          }}
        />
      )}

      {/* Toast Feedback Banner */}
      {alertFeedback && (
        <div className="toast" role="status">
          <span>{alertFeedback}</span>
          <button onClick={() => setAlertFeedback("")}>×</button>
        </div>
      )}

      {/* Broadcast Alert Modal */}
      {alertOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAlertOpen(false);
          }}
        >
          <form className="alert-modal" onSubmit={submitAlert}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">AUTHORIZED OPERATOR ACTION · {currentDistrict.shortName.toUpperCase()}</div>
                <h2>Compose flood emergency alert</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setAlertOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="demo-warning">
              Confirm the target flood sector and evacuation instruction before transmitting.
            </div>
            <label className="field-label">Target Flood Sector</label>
            <input
              value={alertArea}
              onChange={(e) => setAlertArea(e.target.value)}
              required
            />
            <label className="field-label">Severity</label>
            <select
              value={alertSeverity}
              onChange={(e) => setAlertSeverity(e.target.value)}
            >
              <option>INFORMATION</option>
              <option>ADVISORY</option>
              <option>WARNING</option>
              <option>EMERGENCY</option>
            </select>
            <label className="field-label">Message</label>
            <textarea
              rows={5}
              value={alertMessage}
              onChange={(e) => setAlertMessage(e.target.value)}
              required
              maxLength={700}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setAlertOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={alertSending}>
                {alertSending ? "Submitting…" : "Confirm alert request"}
              </button>
            </div>
          </form>
        </div>
      )}

      <footer className="footer">
        ResQNet Kerala Incident Command System · Simulated District Flood Engine ({incidents.length} victims · {boats.length} vessels · {shelters.length} evacuation camps).
      </footer>
    </div>
  );
}
