import React, { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { calculateDistanceKm, formatDistanceAndEta } from "../utils/geo";
import { KERALA_DISTRICTS, getDistrictById } from "../utils/keralaDistricts";

// Custom Leaflet DivIcon for rescue boats
function createBoatIcon(status, isRecommended = false) {
  const bg =
    status === "available"
      ? "#10b981"
      : status === "deployed"
      ? "#f59e0b"
      : "#64748b";
  const glow = isRecommended ? "box-shadow: 0 0 14px #38bdf8; border: 2px solid #38bdf8;" : "";
  return L.divIcon({
    className: "custom-boat-map-pin",
    html: `
      <div style="
        background: ${bg};
        color: #ffffff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.45);
        cursor: pointer;
        transition: transform 0.2s;
        ${glow}
      " title="Rescue Boat (${status})">
        🚤
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Controller to smoothly pan & zoom map when district or target incident changes
function FleetMapController({ district, targetIncident }) {
  const map = useMap();
  React.useEffect(() => {
    if (targetIncident && Number.isFinite(targetIncident.latitude) && Number.isFinite(targetIncident.longitude)) {
      map.setView([targetIncident.latitude, targetIncident.longitude], 13, { animate: true });
    } else if (district) {
      map.setView(district.center, district.zoom, { animate: true });
    }
  }, [district, targetIncident, map]);
  return null;
}

export default function RescueFleetDashboard({
  boats,
  incidents,
  targetedIncidentId,
  selectedDistrictId,
  onSelectDistrict,
  onClearTargetIncident,
  onAssignBoat,
  onUnassignBoat,
  onUpdateBoatPhase,
  onMarkRescued,
  onToggleMaintenance,
  onNavigateToCommandCenter,
  onSelectIncident,
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedBoatId, setSelectedBoatId] = useState(null);
  const [manualAssignModalBoat, setManualAssignModalBoat] = useState(null);
  const [manualSelectedIncidentId, setManualSelectedIncidentId] = useState("");

  const currentDistrict = useMemo(
    () => getDistrictById(selectedDistrictId),
    [selectedDistrictId]
  );

  const targetedIncident = useMemo(
    () => (targetedIncidentId ? incidents.find((x) => x.id === targetedIncidentId) : null),
    [targetedIncidentId, incidents]
  );

  const unassignedIncidents = useMemo(
    () => incidents.filter((x) => ["unassigned", "pending"].includes(x.response_status)),
    [incidents]
  );

  // Compute fleet summary counts
  const stats = useMemo(() => {
    const total = boats.length;
    const available = boats.filter((b) => b.status === "available").length;
    const deployed = boats.filter((b) => b.status === "deployed").length;
    const maintenance = boats.filter((b) => b.status === "maintenance").length;
    const totalRescues = boats.reduce((sum, b) => sum + (b.rescues_completed || 0), 0);
    return { total, available, deployed, maintenance, totalRescues };
  }, [boats]);

  // Compute distance and ETA for each boat relative to targeted incident
  const boatsWithDist = useMemo(() => {
    return boats.map((b) => {
      let distKm = null;
      if (targetedIncident && Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
        distKm = calculateDistanceKm(
          b.latitude,
          b.longitude,
          targetedIncident.latitude,
          targetedIncident.longitude
        );
      }
      return {
        ...b,
        distanceKm: distKm,
        etaText: formatDistanceAndEta(distKm),
        hasSufficientCapacity: targetedIncident
          ? b.capacity >= (targetedIncident.people_count || 1)
          : true,
      };
    });
  }, [boats, targetedIncident]);

  // Filter & Sort
  const filteredBoats = useMemo(() => {
    return boatsWithDist
      .filter((b) => {
        if (statusFilter !== "all" && b.status !== statusFilter) return false;
        if (agencyFilter !== "all" && !b.agency.toLowerCase().includes(agencyFilter.toLowerCase()))
          return false;
        if (selectedDistrictId && selectedDistrictId !== "all") {
          // If a district is chosen, prioritize matching district or keep all if none match
          // We don't hide boats unless explicitly searched
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            b.name.toLowerCase().includes(q) ||
            b.agency.toLowerCase().includes(q) ||
            b.commander.toLowerCase().includes(q) ||
            b.base_name.toLowerCase().includes(q) ||
            (b.district_name && b.district_name.toLowerCase().includes(q)) ||
            (b.assigned_incident_id && b.assigned_incident_id.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "recommended") {
          // Prioritize boats in the currently selected district
          if (selectedDistrictId && selectedDistrictId !== "all") {
            const aInDist = a.district_id === selectedDistrictId;
            const bInDist = b.district_id === selectedDistrictId;
            if (aInDist && !bInDist) return -1;
            if (!aInDist && bInDist) return 1;
          }
          // Available first
          if (a.status === "available" && b.status !== "available") return -1;
          if (a.status !== "available" && b.status === "available") return 1;
          // If targeted incident, sort by distance
          if (targetedIncident) {
            if (a.distanceKm !== null && b.distanceKm !== null) {
              return a.distanceKm - b.distanceKm;
            }
          }
          return b.capacity - a.capacity;
        }
        if (sortBy === "distance") {
          return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
        }
        if (sortBy === "capacity") {
          return b.capacity - a.capacity;
        }
        if (sortBy === "fuel") {
          return b.fuel_percent - a.fuel_percent;
        }
        return 0;
      });
  }, [boatsWithDist, statusFilter, agencyFilter, searchQuery, sortBy, targetedIncident, selectedDistrictId]);

  const agencies = useMemo(() => {
    const set = new Set(boats.map((b) => b.agency));
    return Array.from(set);
  }, [boats]);

  const handleQuickAssign = (boat, incident) => {
    onAssignBoat(boat.id, incident.id);
  };

  return (
    <div className="fleet-dashboard">
      {/* Top Breadcrumb & Navigation */}
      <div className="fleet-header-row">
        <div>
          <div className="eyebrow">KERALA DISASTER RESCUE FLEET OPERATIONS</div>
          <h1 className="fleet-title">Kerala Rescue Boat Fleet &amp; Task Assignment</h1>
          <p className="fleet-subtitle">
            Coordinating Kerala Fire &amp; Rescue, SDRF, NDRF, Indian Navy, Coast Guard &amp; Matsyathozhilali Volunteer Marine Taskforces across all 14 districts.
          </p>
        </div>
        <div className="fleet-header-actions">
          <div className="district-header-selector">
            <label className="field-label" style={{ margin: 0, marginRight: 8 }}>DISTRICT:</label>
            <select
              className="district-select"
              value={selectedDistrictId || "all"}
              onChange={(e) => onSelectDistrict(e.target.value)}
            >
              {KERALA_DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button className="button secondary" onClick={onNavigateToCommandCenter}>
            ← Back to Command Center
          </button>
        </div>
      </div>

      {/* Kerala District Context Banner */}
      <div className="kerala-district-info-banner">
        <span className="district-pin">📍</span>
        <div>
          <strong>{currentDistrict.name}</strong> ·{" "}
          <span className="district-desc">{currentDistrict.floodZone}</span>
        </div>
      </div>

      {/* Target Incident Assignment Callout Banner (if dispatched from an incident) */}
      {targetedIncident && (
        <div className="target-incident-banner">
          <div className="target-banner-content">
            <span className="target-tag">DISPATCH TARGET ACTIVE</span>
            <div className="target-details">
              <h3>
                Case #{targetedIncident.id} · {targetedIncident.location_name || "Kerala Disaster Sector"}
              </h3>
              <p>
                <strong>{targetedIncident.people_count} People Affected</strong> ·{" "}
                <span className={`priority-text ${targetedIncident.priority_level.toLowerCase()}`}>
                  {targetedIncident.priority_level} PRIORITY ({targetedIncident.priority_score}/100)
                </span>{" "}
                · &ldquo;{targetedIncident.description}&rdquo;
              </p>
            </div>
          </div>
          <div className="target-banner-actions">
            <span className="target-tip">
              Select an available boat below to assign this rescue mission. Nearest and capacity-compatible units are prioritized.
            </span>
            <button className="button secondary" onClick={onClearTargetIncident}>
              Clear Target
            </button>
          </div>
        </div>
      )}

      {/* Fleet Stats Overview */}
      <section className="stats-grid fleet-stats-grid">
        <div className="stat">
          <div className="stat-label">TOTAL RESCUE BOATS</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-detail">Kerala inter-agency fleet</div>
        </div>
        <div className="stat success">
          <div className="stat-label">AVAILABLE (READY)</div>
          <div className="stat-value">{stats.available}</div>
          <div className="stat-detail">Ready for immediate tasking</div>
        </div>
        <div className="stat warning">
          <div className="stat-label">DEPLOYED ON MISSION</div>
          <div className="stat-value">{stats.deployed}</div>
          <div className="stat-detail">Actively rescuing or en route</div>
        </div>
        <div className="stat danger">
          <div className="stat-label">MAINTENANCE / DOCKED</div>
          <div className="stat-value">{stats.maintenance}</div>
          <div className="stat-detail">Refueling or motor service</div>
        </div>
        <div className="stat">
          <div className="stat-label">LIVES RESCUED TODAY</div>
          <div className="stat-value" style={{ color: "#38bdf8" }}>
            {stats.totalRescues}
          </div>
          <div className="stat-detail">Kerala flood operations</div>
        </div>
      </section>

      {/* Fleet Map and Overview Section */}
      <section className="fleet-map-section panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">GEOSPATIAL FLEET POSITIONING · KERALA</div>
            <h2>Live Kerala Rescue Vessels &amp; Mission Vectors</h2>
            <p>
              Boats (🚤) and distress beacons (●) mapped in real-time across Kerala river basins.
            </p>
          </div>
          <div className="fleet-map-legend">
            <span><i className="legend-dot green" /> Available</span>
            <span><i className="legend-dot amber" /> Deployed</span>
            <span><i className="legend-dot gray" /> Maintenance</span>
            {targetedIncident && <span><i className="legend-dot cyan" /> Target Incident</span>}
          </div>
        </div>

        <div className="fleet-map-wrap">
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
            <FleetMapController district={currentDistrict} targetIncident={targetedIncident} />

            {/* Target incident marker highlight if set */}
            {targetedIncident && Number.isFinite(targetedIncident.latitude) && (
              <CircleMarker
                center={[targetedIncident.latitude, targetedIncident.longitude]}
                radius={14}
                pathOptions={{
                  color: "#38bdf8",
                  fillColor: "#0284c7",
                  fillOpacity: 0.9,
                  weight: 3,
                  dashArray: "4, 4",
                }}
              >
                <Popup>
                  <strong>TARGET INCIDENT: {targetedIncident.id}</strong>
                  <br />
                  Location: {targetedIncident.location_name}
                  <br />
                  District: {targetedIncident.district_name || "Kerala"}
                  <br />
                  People affected: {targetedIncident.people_count}
                </Popup>
              </CircleMarker>
            )}

            {/* Other incidents on the map */}
            {incidents.map((inc) => {
              if (targetedIncident && inc.id === targetedIncident.id) return null;
              if (!Number.isFinite(inc.latitude) || !Number.isFinite(inc.longitude)) return null;
              return (
                <CircleMarker
                  key={inc.id}
                  center={[inc.latitude, inc.longitude]}
                  radius={7}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: inc.response_status === "assigned" ? "#f59e0b" : "#ef4444",
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => onSelectIncident(inc.id),
                  }}
                >
                  <Popup>
                    <strong>{inc.id}</strong> ({inc.response_status})
                    <br />
                    {inc.people_count} people · {inc.location_name}
                    <br />
                    {inc.assigned_boat_name ? `Assigned: ${inc.assigned_boat_name}` : "Unassigned"}
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Boat Markers */}
            {boats.map((b) => {
              if (!Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return null;
              const isSelected = selectedBoatId === b.id;
              const isNearestToTarget =
                targetedIncident &&
                filteredBoats.length > 0 &&
                filteredBoats[0].id === b.id &&
                b.status === "available";

              const assignedInc = b.assigned_incident_id
                ? incidents.find((x) => x.id === b.assigned_incident_id)
                : null;

              return (
                <React.Fragment key={b.id}>
                  <Marker
                    position={[b.latitude, b.longitude]}
                    icon={createBoatIcon(b.status, isNearestToTarget || isSelected)}
                    eventHandlers={{
                      click: () => setSelectedBoatId(b.id),
                    }}
                  >
                    <Popup>
                      <div className="map-boat-popup">
                        <strong>🚤 {b.name}</strong>
                        <div className="popup-agency">{b.agency}</div>
                        <div className={`popup-status ${b.status}`}>
                          Status: {b.status.toUpperCase()}
                        </div>
                        <div>District: {b.district_name || "Kerala"}</div>
                        <div>Capacity: {b.capacity} Persons</div>
                        <div>Commander: {b.commander}</div>
                        <div>Base: {b.base_name}</div>
                        {b.assigned_incident_id && (
                          <div className="popup-assigned">
                            Assigned to: <strong>{b.assigned_incident_id}</strong> (
                            {b.assigned_incident_location})
                          </div>
                        )}
                        {targetedIncident && b.status === "available" && (
                          <button
                            className="button primary full"
                            style={{ marginTop: 8, padding: "6px 10px", fontSize: 11 }}
                            onClick={() => handleQuickAssign(b, targetedIncident)}
                          >
                            Assign to {targetedIncident.id}
                          </button>
                        )}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Connecting polyline to assigned incident */}
                  {assignedInc &&
                    Number.isFinite(assignedInc.latitude) &&
                    Number.isFinite(assignedInc.longitude) && (
                      <Polyline
                        positions={[
                          [b.latitude, b.longitude],
                          [assignedInc.latitude, assignedInc.longitude],
                        ]}
                        pathOptions={{
                          color: "#f59e0b",
                          weight: 3,
                          dashArray: "6, 8",
                          opacity: 0.8,
                        }}
                      />
                    )}
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>
      </section>

      {/* Fleet Controls / Filter Bar */}
      <section className="fleet-filter-bar panel">
        <div className="fleet-filter-grid">
          <div className="filter-group search-group">
            <label className="field-label">Search Vessels &amp; Teams</label>
            <input
              type="text"
              placeholder="Search boat name, agency, commander, base, district..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label className="field-label">Availability Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses ({boats.length})</option>
              <option value="available">Available Only ({stats.available})</option>
              <option value="deployed">Deployed / On Mission ({stats.deployed})</option>
              <option value="maintenance">Maintenance ({stats.maintenance})</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="field-label">Agency / Force</label>
            <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
              <option value="all">All Agencies</option>
              {agencies.map((agency) => (
                <option key={agency} value={agency}>
                  {agency}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="field-label">Sort Priority</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="recommended">Recommended (Smart Dispatch)</option>
              {targetedIncident && <option value="distance">Proximity (Closest First)</option>}
              <option value="capacity">Capacity (High to Low)</option>
              <option value="fuel">Fuel Level (High to Low)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Boats Grid */}
      <section className="boats-grid-section">
        <div className="boats-grid-header">
          <h3>
            Vessels Available for Deployment ({filteredBoats.length} of {boats.length})
          </h3>
          {targetedIncident && (
            <span className="boats-grid-hint">
              Showing distance &amp; compatibility for <strong>{targetedIncident.id}</strong> (
              {targetedIncident.people_count} people affected)
            </span>
          )}
        </div>

        {filteredBoats.length === 0 ? (
          <div className="empty-fleet-state panel">
            <p>No rescue boats match your filter criteria.</p>
            <button
              className="button secondary"
              onClick={() => {
                setStatusFilter("all");
                setAgencyFilter("all");
                setSearchQuery("");
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="boats-cards-grid">
            {filteredBoats.map((boat) => {
              const isAvailable = boat.status === "available";
              const isDeployed = boat.status === "deployed";
              const isMaintenance = boat.status === "maintenance";
              const isSelected = selectedBoatId === boat.id;
              const assignedIncident = boat.assigned_incident_id
                ? incidents.find((x) => x.id === boat.assigned_incident_id)
                : null;

              return (
                <div
                  key={boat.id}
                  className={`boat-card panel ${boat.status} ${
                    isSelected ? "selected-boat-card" : ""
                  }`}
                  onClick={() => setSelectedBoatId(boat.id)}
                >
                  {/* Boat Card Top Header */}
                  <div className="boat-card-header">
                    <div className="boat-id-row">
                      <span className="boat-type-badge">{boat.type}</span>
                      <span className={`status-pill ${boat.status}`}>
                        <i />
                        {boat.status === "available"
                          ? "AVAILABLE"
                          : boat.status === "deployed"
                          ? "ON MISSION"
                          : "MAINTENANCE"}
                      </span>
                    </div>
                    <h3 className="boat-name">{boat.name}</h3>
                    <div className="boat-agency-row">
                      <span className="boat-agency">{boat.agency}</span>
                      {boat.district_name && (
                        <span className="boat-district-tag">📍 {boat.district_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Proximity / Targeted Incident ETA banner */}
                  {targetedIncident && isAvailable && (
                    <div
                      className={`boat-proximity-banner ${
                        boat.hasSufficientCapacity ? "compatible" : "warning"
                      }`}
                    >
                      <div className="proximity-eta">
                        <span>📍 PROXIMITY TO {targetedIncident.id}</span>
                        <strong>{boat.etaText}</strong>
                      </div>
                      <div className="capacity-fit">
                        {boat.hasSufficientCapacity ? (
                          <span className="fit-badge ok">✓ Capacity Fits ({boat.capacity} cap.)</span>
                        ) : (
                          <span className="fit-badge warn">
                            ⚠ Capacity {boat.capacity} &lt; {targetedIncident.people_count} needed
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Boat Specs & Crew Grid */}
                  <div className="boat-specs-grid">
                    <div className="spec-item">
                      <span className="spec-label">PASSENGER CAPACITY</span>
                      <strong className="spec-value">
                        {boat.capacity} <small>persons</small>
                      </strong>
                    </div>

                    <div className="spec-item">
                      <span className="spec-label">LEAD COMMANDER</span>
                      <strong className="spec-value">{boat.commander}</strong>
                      <span className="spec-sub">{boat.crew_count} crew members</span>
                    </div>

                    <div className="spec-item">
                      <span className="spec-label">STAGING POST</span>
                      <strong className="spec-value">{boat.base_name}</strong>
                    </div>

                    <div className="spec-item">
                      <span className="spec-label">FUEL / ENERGY</span>
                      <div className="fuel-meter-row">
                        <div className="fuel-bar-track">
                          <div
                            className={`fuel-bar-fill ${
                              boat.fuel_percent > 60
                                ? "high"
                                : boat.fuel_percent > 30
                                ? "medium"
                                : "low"
                            }`}
                            style={{ width: `${boat.fuel_percent}%` }}
                          />
                        </div>
                        <span className="fuel-text">{boat.fuel_percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Equipment Badges */}
                  <div className="equipment-tags">
                    {boat.equipment.map((item, idx) => (
                      <span key={idx} className="equip-tag">
                        {item}
                      </span>
                    ))}
                  </div>

                  {/* Contact / Radio info */}
                  <div className="boat-contact-row">
                    <span>RADIO / COMMS:</span> <strong>{boat.contact}</strong>
                  </div>

                  {/* Active Mission Telemetry (if deployed) */}
                  {isDeployed && (
                    <div className="active-mission-box">
                      <div className="mission-box-header">
                        <span className="mission-title">CURRENT ASSIGNMENT</span>
                        <span className="mission-phase-badge">
                          Phase: {(boat.mission_phase || "en_route").replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      <div className="mission-incident-details">
                        <strong>
                          Incident #{boat.assigned_incident_id}
                          {boat.assigned_incident_location ? ` · ${boat.assigned_incident_location}` : ""}
                        </strong>
                        {assignedIncident && (
                          <p>
                            {assignedIncident.people_count} people affected · &ldquo;
                            {assignedIncident.description}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Phase Progression Buttons */}
                      <div className="mission-phase-controls">
                        <button
                          className={`phase-btn ${boat.mission_phase === "en_route" ? "active" : ""}`}
                          onClick={() => onUpdateBoatPhase(boat.id, "en_route")}
                          title="Boat is moving towards incident"
                        >
                          1. En Route
                        </button>
                        <button
                          className={`phase-btn ${boat.mission_phase === "on_scene" ? "active" : ""}`}
                          onClick={() => onUpdateBoatPhase(boat.id, "on_scene")}
                          title="Boat reached disaster scene"
                        >
                          2. On Scene
                        </button>
                        <button
                          className={`phase-btn ${boat.mission_phase === "rescuing" ? "active" : ""}`}
                          onClick={() => onUpdateBoatPhase(boat.id, "rescuing")}
                          title="Currently extracting victims"
                        >
                          3. Rescuing
                        </button>
                      </div>

                      {/* Complete Rescue / Recall Action */}
                      <div className="mission-actions-row">
                        <button
                          className="button primary full"
                          onClick={() => onMarkRescued(boat.id, boat.assigned_incident_id)}
                        >
                          ✓ Complete Mission &amp; Mark Rescued
                        </button>
                        <button
                          className="button secondary"
                          style={{ marginTop: 6, width: "100%", fontSize: 11 }}
                          onClick={() => onUnassignBoat(boat.id, boat.assigned_incident_id)}
                        >
                          Recall Vessel / Unassign
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Assignment Actions (if available) */}
                  {isAvailable && (
                    <div className="boat-action-area">
                      {targetedIncident ? (
                        <button
                          className="button primary full assign-highlight-btn"
                          onClick={() => handleQuickAssign(boat, targetedIncident)}
                        >
                          🚀 Assign to {targetedIncident.id} ({targetedIncident.people_count} People)
                        </button>
                      ) : (
                        <div className="available-actions-cluster">
                          <button
                            className="button primary full"
                            onClick={() => {
                              setManualAssignModalBoat(boat);
                              setManualSelectedIncidentId(unassignedIncidents[0]?.id || "");
                            }}
                          >
                            Assign Task to This Boat...
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Maintenance State Actions */}
                  {isMaintenance && (
                    <div className="boat-action-area">
                      <div className="maintenance-notice">
                        Vessel currently undergoing refuel or equipment servicing.
                      </div>
                      <button
                        className="button secondary full"
                        style={{ marginTop: 8 }}
                        onClick={() => onToggleMaintenance(boat.id)}
                      >
                        ✓ Mark Ready for Service
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manual Task Assignment Modal */}
      {manualAssignModalBoat && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setManualAssignModalBoat(null);
          }}
        >
          <div className="alert-modal assignment-modal">
            <div className="modal-heading">
              <div>
                <div className="eyebrow">VESSEL DISPATCH CONTROL · KERALA</div>
                <h2>Task Assignment: {manualAssignModalBoat.name}</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setManualAssignModalBoat(null)}
              >
                ×
              </button>
            </div>

            <div className="dispatch-summary-box">
              <div>
                <strong>{manualAssignModalBoat.name}</strong> ({manualAssignModalBoat.agency})
              </div>
              <div>Capacity: {manualAssignModalBoat.capacity} persons · Commander: {manualAssignModalBoat.commander}</div>
              <div>Dock: {manualAssignModalBoat.base_name} · Comms: {manualAssignModalBoat.contact}</div>
            </div>

            <label className="field-label" style={{ marginTop: 14 }}>
              Select Unassigned SOS Case in Kerala to Dispatch
            </label>
            {unassignedIncidents.length === 0 ? (
              <p className="muted" style={{ padding: "12px 0" }}>
                All Kerala SOS distress reports are currently assigned or rescued!
              </p>
            ) : (
              <select
                value={manualSelectedIncidentId}
                onChange={(e) => setManualSelectedIncidentId(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                {unassignedIncidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.id} [{inc.district_name || "Kerala"}] - {inc.location_name} ({inc.priority_level} · {inc.people_count} people) - &ldquo;{inc.description}&rdquo;
                  </option>
                ))}
              </select>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setManualAssignModalBoat(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!manualSelectedIncidentId}
                onClick={() => {
                  onAssignBoat(manualAssignModalBoat.id, manualSelectedIncidentId);
                  setManualAssignModalBoat(null);
                }}
              >
                Confirm Dispatch Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
