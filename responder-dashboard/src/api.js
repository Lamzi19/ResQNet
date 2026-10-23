import { generateDistrictScenario } from "./utils/keralaSimulator";
import { mockAlerts } from "./mockData";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const USE_MOCK = !API_BASE;

function getDistrictStorageKey(districtId) {
  return `resqnet_sim_scenario_v5_${districtId || "ernakulam"}`;
}

// Read scenario from local database
function getLocalDistrictScenario(districtId, forceRegenerate = false) {
  const key = getDistrictStorageKey(districtId);
  if (!forceRegenerate) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error(`Error reading ${key}:`, e);
    }
  }
  // Generate 35 victims and 15 boats for this district
  const fresh = generateDistrictScenario(districtId, 35, 15);
  saveLocalDistrictScenario(districtId, fresh);
  return fresh;
}

// Save scenario to local database
function saveLocalDistrictScenario(districtId, data) {
  const key = getDistrictStorageKey(districtId);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${message || response.statusText}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

// --- Fetch Complete District Flood Scenario ---
export async function getDistrictScenarioData(districtId = "ernakulam", forceRegenerate = false) {
  if (USE_MOCK) {
    return getLocalDistrictScenario(districtId, forceRegenerate);
  }

  // Live Backend Integration hook (when merging with teammates' API)
  try {
    const [sosData, boatsData, riskData] = await Promise.all([
      request(`/api/sos?district=${encodeURIComponent(districtId)}`),
      request(`/api/boats?district=${encodeURIComponent(districtId)}`).catch(() => null),
      request(`/api/risk?district=${encodeURIComponent(districtId)}`).catch(() => null),
    ]);

    const localData = getLocalDistrictScenario(districtId, false);
    return {
      district: localData.district,
      incidents: Array.isArray(sosData) ? sosData : (sosData?.items || localData.incidents),
      boats: Array.isArray(boatsData) ? boatsData : (boatsData?.items || localData.boats),
      shelters: localData.shelters,
      riskZones: Array.isArray(riskData) ? riskData : (riskData?.items || localData.riskZones),
    };
  } catch (err) {
    console.warn(`Backend call for district ${districtId} failed, using local simulation:`, err);
    return getLocalDistrictScenario(districtId, forceRegenerate);
  }
}

// --- Assign Boat to Incident & Persist ---
export async function assignBoatToIncident(boatId, incidentId, districtId = "ernakulam", notes = "") {
  const scenario = getLocalDistrictScenario(districtId, false);

  const boat = scenario.boats.find((b) => b.id === boatId);
  const incident = scenario.incidents.find((i) => i.id === incidentId);

  scenario.boats = scenario.boats.map((b) => {
    if (b.id === boatId) {
      return {
        ...b,
        status: "deployed",
        assigned_incident_id: incidentId,
        assigned_incident_location: incident?.location_name || `${scenario.district.shortName} Flood Sector`,
        mission_phase: "en_route",
        mission_started_at: new Date().toISOString(),
      };
    }
    return b;
  });

  scenario.incidents = scenario.incidents.map((inc) => {
    if (inc.id === incidentId) {
      return {
        ...inc,
        response_status: "assigned",
        assigned_boat_id: boatId,
        assigned_boat_name: boat?.name || "Rescue Vessel",
        mission_phase: "en_route",
        assigned_at: new Date().toISOString(),
      };
    }
    return inc;
  });

  saveLocalDistrictScenario(districtId, scenario);

  if (!USE_MOCK) {
    try {
      await request(`/api/sos/${encodeURIComponent(incidentId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "assigned",
          assigned_boat_id: boatId,
          assigned_boat_name: boat?.name || null,
        }),
      });
    } catch (err) {
      console.warn("Backend status update failed:", err);
    }
  }

  return { success: true, scenario };
}

// --- Update Incident Status ---
export async function updateIncidentStatus(incidentId, status, districtId = "ernakulam", assignedBoat = null) {
  const scenario = getLocalDistrictScenario(districtId, false);

  scenario.incidents = scenario.incidents.map((inc) => {
    if (inc.id === incidentId) {
      return {
        ...inc,
        response_status: status,
        ...(assignedBoat ? { assigned_boat_id: assignedBoat.id, assigned_boat_name: assignedBoat.name } : {}),
        ...(status === "unassigned" ? { assigned_boat_id: null, assigned_boat_name: null, mission_phase: null } : {}),
      };
    }
    return inc;
  });

  if (status === "unassigned") {
    scenario.boats = scenario.boats.map((b) => {
      if (b.assigned_incident_id === incidentId) {
        return {
          ...b,
          status: "available",
          assigned_incident_id: null,
          assigned_incident_location: null,
          mission_phase: "standby",
        };
      }
      return b;
    });
  }

  saveLocalDistrictScenario(districtId, scenario);

  if (!USE_MOCK) {
    try {
      await request(`/api/sos/${encodeURIComponent(incidentId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, assigned_boat_id: assignedBoat?.id || null }),
      });
    } catch (err) {
      console.warn("Backend PATCH /api/sos failed:", err);
    }
  }

  return { success: true, scenario };
}

// --- Update Boat Status ---
export async function updateBoatStatus(boatId, status, districtId = "ernakulam", missionPhase = "standby") {
  const scenario = getLocalDistrictScenario(districtId, false);
  let targetIncidentId = null;

  scenario.boats = scenario.boats.map((b) => {
    if (b.id === boatId) {
      targetIncidentId = b.assigned_incident_id;
      return {
        ...b,
        status,
        mission_phase: missionPhase,
        ...(status === "available" ? { assigned_incident_id: null, assigned_incident_location: null } : {}),
      };
    }
    return b;
  });

  if (targetIncidentId) {
    scenario.incidents = scenario.incidents.map((inc) => {
      if (inc.id === targetIncidentId) {
        return {
          ...inc,
          mission_phase: missionPhase,
          ...(status === "available" ? { response_status: "rescued" } : {}),
        };
      }
      return inc;
    });
  }

  saveLocalDistrictScenario(districtId, scenario);

  if (!USE_MOCK) {
    try {
      await request(`/api/boats/${encodeURIComponent(boatId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, mission_phase: missionPhase }),
      });
    } catch (err) {
      console.warn("Backend boat status update failed:", err);
    }
  }

  return { success: true, scenario };
}

// --- Complete Rescue Mission ---
export async function completeRescueMission(boatId, incidentId, districtId = "ernakulam") {
  const scenario = getLocalDistrictScenario(districtId, false);
  const incident = scenario.incidents.find((i) => i.id === incidentId);
  const peopleCount = incident?.people_count || 1;

  scenario.incidents = scenario.incidents.map((inc) => {
    if (inc.id === incidentId) {
      return {
        ...inc,
        response_status: "rescued",
        mission_phase: "completed",
      };
    }
    return inc;
  });

  scenario.boats = scenario.boats.map((b) => {
    if (b.id === boatId || b.assigned_incident_id === incidentId) {
      return {
        ...b,
        status: "available",
        assigned_incident_id: null,
        assigned_incident_location: null,
        mission_phase: "standby",
        rescues_completed: (b.rescues_completed || 0) + peopleCount,
      };
    }
    return b;
  });

  saveLocalDistrictScenario(districtId, scenario);

  if (!USE_MOCK) {
    try {
      await request(`/api/sos/${encodeURIComponent(incidentId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rescued" }),
      });
    } catch (err) {
      console.warn("Backend status update failed:", err);
    }
  }

  return { success: true, scenario };
}

// --- Alerts ---
export async function getAlerts() {
  try {
    const raw = localStorage.getItem("resqnet_alerts_v5");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return mockAlerts;
}

export async function createAlert(payload) {
  const alerts = await getAlerts();
  const newAlert = {
    id: `ALERT-KL-${Date.now()}`,
    ...payload,
    status: USE_MOCK ? "SIMULATED_NOT_SENT" : "QUEUED",
    mock: USE_MOCK,
  };
  const updated = [newAlert, ...alerts];
  try {
    localStorage.setItem("resqnet_alerts_v5", JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }
  return newAlert;
}
