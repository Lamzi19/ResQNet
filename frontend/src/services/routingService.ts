/**
 * ResQNet Road Routing Service
 * =============================
 * 
 * Communicates with the official documented OSRM (Open Source Routing Machine)
 * HTTP API to calculate real-world road network driving routes between the
 * user's validated GPS coordinates and relief centres.
 * 
 * Safety & Privacy Design:
 * 1. Validates all coordinates before generating GeoJSON polylines.
 * 2. Emits human-readable turn-by-turn maneuvers from OSRM step payloads.
 * 3. Does not store or track coordinates; transmits them solely to OSRM.
 * 4. Provides Google Maps external fallback links.
 * 5. Handles timeouts, network failure, and unreachable destinations gracefully.
 */

export interface RouteStep {
  instruction: string;
  distance_m: number;
  duration_s: number;
  maneuver_type: string;
  modifier?: string;
  name: string;
}

export interface RouteResult {
  coordinates: [number, number][]; // Leaflet [lat, lng]
  distance_km: number;
  duration_mins: number;
  steps: RouteStep[];
  summary: string;
  provider: string;
  google_maps_url: string;
  calculated_at: string;
}

const OSRM_PUBLIC_API = "https://router.project-osrm.org/route/v1/driving";

/**
 * Generates an external Google Maps navigation URL.
 */
export function getGoogleMapsDirectionsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
}

/**
 * Formats an OSRM step maneuver into a clear human-readable direction.
 */
function formatStepInstruction(step: any): string {
  const maneuver = step.maneuver || {};
  const type = maneuver.type || "turn";
  const modifier = maneuver.modifier || "";
  const roadName = (step.name || "").trim();

  let action = "Continue";
  if (type === "depart") {
    action = modifier ? `Depart heading ${modifier}` : "Depart";
  } else if (type === "arrive") {
    return roadName ? `Arrive at destination on ${roadName}` : "Arrive at destination";
  } else if (type === "turn") {
    action = modifier ? `Turn ${modifier}` : "Turn";
  } else if (type === "new name") {
    action = "Continue onto";
  } else if (type === "end of road") {
    action = modifier ? `Turn ${modifier} at end of road` : "Turn at end of road";
  } else if (type === "fork") {
    action = modifier ? `Take the fork ${modifier}` : "Take the fork";
  } else if (type === "roundabout" || type === "rotary") {
    const exit = maneuver.exit ? `take exit ${maneuver.exit}` : "proceed";
    action = `Enter roundabout and ${exit}`;
  } else if (type === "merge") {
    action = modifier ? `Merge ${modifier}` : "Merge";
  } else if (type === "on ramp") {
    action = modifier ? `Take ramp ${modifier}` : "Take ramp";
  } else if (type === "off ramp") {
    action = modifier ? `Take exit ramp ${modifier}` : "Take exit ramp";
  } else if (modifier) {
    action = `${type} ${modifier}`;
  }

  if (roadName) {
    return `${action} onto ${roadName}`;
  }
  return action;
}

/**
 * Requests driving road route from OSRM HTTP API.
 */
export async function fetchRoadRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  timeoutMs = 12000
): Promise<RouteResult> {
  // 1. Strict Coordinate Validation
  if (
    !Number.isFinite(originLat) || !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) || !Number.isFinite(destLng)
  ) {
    throw new Error("Invalid geographic coordinates provided for route calculation.");
  }

  // Bounds check for realistic Indian subcontinent coordinates
  if (
    originLat < 6.0 || originLat > 38.0 || originLng < 68.0 || originLng > 98.0 ||
    destLat < 6.0 || destLat > 38.0 || destLng < 68.0 || destLng > 98.0
  ) {
    throw new Error("Coordinates are outside valid geographic boundaries.");
  }

  // OSRM coordinates order: {lon},{lat};{lon},{lat}
  const url = `${OSRM_PUBLIC_API}/${originLng.toFixed(6)},${originLat.toFixed(6)};${destLng.toFixed(6)},${destLat.toFixed(6)}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json"
      }
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      if (resp.status === 429) {
        throw new Error("Public routing service rate limit reached. Please wait a moment or open directly in Google Maps.");
      }
      throw new Error(`Routing service returned HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      if (data.code === "NoRoute") {
        throw new Error("No navigable road route could be found between your location and this facility. Destination may be cut off or on an unconnected island/track.");
      }
      throw new Error(`Routing provider error: ${data.message || data.code || "Unknown error"}`);
    }

    const route = data.routes[0];
    const rawCoords = route.geometry?.coordinates;

    if (!Array.isArray(rawCoords) || rawCoords.length < 2) {
      throw new Error("Routing provider returned an empty or invalid route geometry.");
    }

    // Convert GeoJSON [lon, lat] to Leaflet [lat, lon]
    const leafletCoords: [number, number][] = [];
    for (const pt of rawCoords) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lon = pt[0];
        const lat = pt[1];
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          leafletCoords.push([lat, lon]);
        }
      }
    }

    if (leafletCoords.length < 2) {
      throw new Error("Failed to extract valid route line points from provider response.");
    }

    // Extract turn-by-turn steps
    const steps: RouteStep[] = [];
    const legs = route.legs || [];
    if (legs.length > 0 && Array.isArray(legs[0].steps)) {
      for (const s of legs[0].steps) {
        steps.push({
          instruction: formatStepInstruction(s),
          distance_m: Math.round(s.distance || 0),
          duration_s: Math.round(s.duration || 0),
          maneuver_type: s.maneuver?.type || "turn",
          modifier: s.maneuver?.modifier,
          name: (s.name || "").trim()
        });
      }
    }

    const distanceKm = Math.round((route.distance / 1000.0) * 10) / 10;
    const durationMins = Math.max(1, Math.round(route.duration / 60.0));
    const googleUrl = getGoogleMapsDirectionsUrl(originLat, originLng, destLat, destLng);

    return {
      coordinates: leafletCoords,
      distance_km: distanceKm,
      duration_mins: durationMins,
      steps,
      summary: legs[0]?.summary || "Driving route via road network",
      provider: "Open Source Routing Machine (OSRM / OpenStreetMap)",
      google_maps_url: googleUrl,
      calculated_at: new Date().toISOString()
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Routing request timed out. Public routing server took too long to respond. Try again or open in Google Maps.");
    }
    throw err;
  }
}
