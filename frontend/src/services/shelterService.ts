/**
 * ResQNet Shelter & Evacuation Facility Service
 * ==============================================
 * 
 * Manages relief facility datasets, browser GPS location requests,
 * Haversine proximity calculations, and offline storage failover.
 * 
 * Strict Truthfulness Guarantee:
 * - Accurately reports offline status.
 * - Does not invent coordinates, telephone numbers, or verification status.
 * - Explains that facilities reflect the historical August 2020 SEOC GIS baseline registry.
 */

export interface ShelterOccupancyInfo {
  shelter_id: string;
  is_operational: boolean;
  total_capacity?: number | null;
  verified_operational_capacity?: number | null;
  occupied_count: number;
  reserved_count: number;
  available_count: number;
  occupancy_pct?: number | null;
  status: 'AVAILABLE' | 'LIMITED' | 'FULL' | 'UNVERIFIED';
  is_simulated: boolean;
  verification_notes?: string | null;
  updated_by: string;
  updated_at: string;
}

export interface ReliefFacility {
  id: string;
  sl_no: number;
  district_id: string;
  district_name: string;
  name: string;
  latitude: number;
  longitude: number;
  capacity_persons: number | null;
  facility_type: string | null;
  ownership: string | null;
  village: string | null;
  lsg: string | null;
  coordinates_swapped?: boolean;
  distance_km?: number;
  bearing_deg?: number;
  occupancy?: ShelterOccupancyInfo;
}

export interface ReservationResponse {
  id: string;
  shelter_id: string;
  shelter_name: string;
  district_id: string;
  group_size: number;
  status: 'ACTIVE' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED';
  created_at: string;
  expires_at: string;
  checked_in_at?: string | null;
  cancelled_at?: string | null;
  available_capacity_after: number;
  message: string;
}

export interface RecommendedShelterItem {
  shelter_id: string;
  name: string;
  district_id: string;
  district_name: string;
  latitude: number;
  longitude: number;
  straight_line_distance_km: number;
  estimated_road_distance_km?: number | null;
  occupancy_status: 'AVAILABLE' | 'LIMITED' | 'FULL' | 'UNVERIFIED';
  verified_operational: boolean;
  available_capacity: number;
  total_capacity?: number | null;
  recommendation_reason: string;
  is_primary: boolean;
  is_alternative: boolean;
  hazard_warning?: string | null;
}

export interface ShelterRecommendationResponse {
  primary_recommendation?: RecommendedShelterItem | null;
  alternatives: RecommendedShelterItem[];
  nearest_facility_was_full: boolean;
  nearest_full_facility_name?: string | null;
  group_size: number;
  unverified_disclaimer: string;
  hazard_disclaimer: string;
}

export interface UserGeoLocation {
  lat: number;
  lng: number;
  accuracy_m?: number;
  is_gps: boolean;
  status: 'GPS_ACTIVE' | 'GPS_DENIED' | 'GPS_UNAVAILABLE' | 'GPS_TIMEOUT' | 'DISTRICT_CENTROID';
  message: string;
}

const LOCAL_STORAGE_KEY = "resqnet_relief_facilities_cache_v3";
const RESERVATION_STORAGE_KEY = "resqnet_active_shelter_reservation";

/**
 * Great-circle distance between two coordinates using the Haversine formula.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0; // Earth mean radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Calculates initial compass bearing in degrees (0 = North, 90 = East, etc.)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

/**
 * Request real-time user GPS location from browser Geolocation API
 * with explicit error handling and district centroid fallback.
 */
export async function requestUserLocation(
  fallbackLat = 9.9816,
  fallbackLng = 76.2999
): Promise<UserGeoLocation> {
  if (!navigator.geolocation) {
    return {
      lat: fallbackLat,
      lng: fallbackLng,
      is_gps: false,
      status: 'GPS_UNAVAILABLE',
      message: 'Geolocation is not supported by your browser. Using selected district center.'
    };
  }

  return new Promise<UserGeoLocation>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: Math.round(position.coords.accuracy),
          is_gps: true,
          status: 'GPS_ACTIVE',
          message: `Live GPS location acquired (±${Math.round(position.coords.accuracy)}m accuracy).`
        });
      },
      (error) => {
        let status: UserGeoLocation['status'] = 'GPS_UNAVAILABLE';
        let message = 'Unable to determine GPS location.';

        if (error.code === error.PERMISSION_DENIED) {
          status = 'GPS_DENIED';
          message = 'Location permission denied by user. Showing nearest facilities to district center.';
        } else if (error.code === error.TIMEOUT) {
          status = 'GPS_TIMEOUT';
          message = 'GPS location request timed out. Showing facilities relative to district center.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          status = 'GPS_UNAVAILABLE';
          message = 'GPS satellites or cell towers unavailable. Showing facilities relative to district center.';
        }

        resolve({
          lat: fallbackLat,
          lng: fallbackLng,
          is_gps: false,
          status,
          message
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

export interface ShelterDatasetResult {
  facilities: ReliefFacility[];
  isOffline: boolean;
  sourceDate: string;
  sourceAgency: string;
  totalRegistryCount: number;
  mappedCount: number;
  unmappedCount: number;
}

/**
 * Loads relief facilities with automatic multi-tiered fallback:
 * 1. Backend REST API (`/api/shelters`)
 * 2. Static bundled JSON (`/data/kerala_relief_camps.json`)
 * 3. LocalStorage persistence
 */
export async function loadReliefFacilities(): Promise<ShelterDatasetResult> {
  const defaultMeta = {
    sourceDate: "2020-08-05",
    sourceAgency: "Kerala State Emergency Operations Centre (SEOC GIS Cell)",
    totalRegistryCount: 6377,
    mappedCount: 6001,
    unmappedCount: 376
  };

  // Tier 1: Try Backend REST API
  try {
    const res = await fetch("http://localhost:8000/api/shelters?limit=7000", {
      headers: { "Accept": "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      const facilities: ReliefFacility[] = data.facilities.map((f: any) => ({
        id: f.id,
        sl_no: f.sl_no,
        district_id: f.district_id,
        district_name: f.district_name,
        name: f.name,
        latitude: f.latitude,
        longitude: f.longitude,
        capacity_persons: f.capacity_persons,
        facility_type: f.facility_type,
        ownership: f.ownership,
        village: f.village,
        lsg: f.lsg,
        coordinates_swapped: f.coordinates_swapped,
        occupancy: f.occupancy
      }));

      // Cache to localStorage for offline resilience
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
          cachedAt: new Date().toISOString(),
          facilities,
          metadata: {
            sourceDate: data.source_compilation_date || defaultMeta.sourceDate,
            sourceAgency: data.source_agency || defaultMeta.sourceAgency,
            totalRegistryCount: data.total_facilities_in_registry || defaultMeta.totalRegistryCount,
            mappedCount: data.mapped_facilities_count || defaultMeta.mappedCount,
            unmappedCount: data.unmapped_facilities_count || defaultMeta.unmappedCount
          }
        }));
      } catch (e) {
        console.warn("Could not write relief facilities to localStorage:", e);
      }

      return {
        facilities,
        isOffline: false,
        sourceDate: data.source_compilation_date || defaultMeta.sourceDate,
        sourceAgency: data.source_agency || defaultMeta.sourceAgency,
        totalRegistryCount: data.total_facilities_in_registry || defaultMeta.totalRegistryCount,
        mappedCount: data.mapped_facilities_count || defaultMeta.mappedCount,
        unmappedCount: data.unmapped_facilities_count || defaultMeta.unmappedCount
      };
    }
  } catch (backendErr) {
    console.info("Backend API unreachable, trying static bundled dataset...", backendErr);
  }

  // Tier 2: Try LocalStorage cache if backend is unreachable
  try {
    const rawCache = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (Array.isArray(parsed.facilities) && parsed.facilities.length > 0) {
        return {
          facilities: parsed.facilities,
          isOffline: true,
          sourceDate: parsed.metadata?.sourceDate || defaultMeta.sourceDate,
          sourceAgency: parsed.metadata?.sourceAgency || defaultMeta.sourceAgency,
          totalRegistryCount: parsed.metadata?.totalRegistryCount || defaultMeta.totalRegistryCount,
          mappedCount: parsed.metadata?.mappedCount || defaultMeta.mappedCount,
          unmappedCount: parsed.metadata?.unmappedCount || defaultMeta.unmappedCount
        };
      }
    }
  } catch (storageErr) {
    console.warn("LocalStorage cache read failed:", storageErr);
  }

  // Tier 3: Try local bundled JSON file
  try {
    const staticRes = await fetch("/data/kerala_relief_camps.json");
    if (staticRes.ok) {
      const staticData = await staticRes.json();
      const facilities: ReliefFacility[] = (staticData.facilities || []).map((f: any) => ({
        id: f.id,
        sl_no: f.sl,
        district_id: f.d_id,
        district_name: f.d_name,
        name: f.name,
        latitude: f.lat,
        longitude: f.lng,
        capacity_persons: f.cap,
        facility_type: f.type,
        ownership: f.own,
        village: f.vil,
        lsg: f.lsg,
        coordinates_swapped: f.swp,
        occupancy: {
          shelter_id: f.id,
          is_operational: false,
          total_capacity: f.cap,
          verified_operational_capacity: null,
          occupied_count: 0,
          reserved_count: 0,
          available_count: 0,
          occupancy_pct: null,
          status: 'UNVERIFIED',
          is_simulated: false,
          verification_notes: 'Offline static dataset fallback. Capacity unverified.',
          updated_by: 'Offline Fallback',
          updated_at: new Date().toISOString()
        }
      }));

      return {
        facilities,
        isOffline: true, // Served via local static bundle
        sourceDate: staticData.metadata?.source_date || defaultMeta.sourceDate,
        sourceAgency: staticData.metadata?.source_agency || defaultMeta.sourceAgency,
        totalRegistryCount: staticData.metadata?.total_raw_records || defaultMeta.totalRegistryCount,
        mappedCount: staticData.metadata?.total_facilities || defaultMeta.mappedCount,
        unmappedCount: staticData.metadata?.unmapped_facilities || defaultMeta.unmappedCount
      };
    }
  } catch (staticErr) {
    console.info("Static file fetch failed, attempting localStorage fallback...", staticErr);
  }

  throw new Error("Unable to load Kerala relief facilities from backend, static bundle, or local cache.");
}

/**
 * Annotates each facility with Haversine distance and bearing relative to user coordinates,
 * and sorts them from nearest to farthest.
 */
export function sortFacilitiesByProximity(
  userLat: number,
  userLng: number,
  facilities: ReliefFacility[]
): ReliefFacility[] {
  return facilities
    .map((fac) => {
      const dist = calculateHaversineDistanceKm(userLat, userLng, fac.latitude, fac.longitude);
      const bearing = calculateBearing(userLat, userLng, fac.latitude, fac.longitude);
      return {
        ...fac,
        distance_km: dist,
        bearing_deg: bearing
      };
    })
    .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
}

// ---------------------------------------------------------------------------
// OCCUPANCY, RESERVATIONS, CHECK-IN, AND ALLOCATION API METHODS
// ---------------------------------------------------------------------------

const BACKEND_URL = "http://localhost:8000";

/**
 * Creates an atomic shelter reservation hold.
 */
export async function reserveShelterSpace(
  shelterId: string,
  groupSize: number,
  citizenContact?: string,
  notes?: string,
  expiryMinutes = 120
): Promise<ReservationResponse> {
  const resp = await fetch(`${BACKEND_URL}/api/shelters/reserve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shelter_id: shelterId,
      group_size: groupSize,
      citizen_contact: citizenContact,
      notes: notes,
      expiry_minutes: expiryMinutes
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Reservation failed (HTTP ${resp.status})`);
  }

  const reservation: ReservationResponse = await resp.json();
  saveLocalReservation(reservation);
  return reservation;
}

/**
 * Confirms arrival and check-in for an active reservation.
 */
export async function checkInReservation(
  reservationId: string,
  staffPin?: string
): Promise<ReservationResponse> {
  const resp = await fetch(`${BACKEND_URL}/api/shelters/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reservation_id: reservationId,
      staff_pin: staffPin
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Check-in failed (HTTP ${resp.status})`);
  }

  const result: ReservationResponse = await resp.json();
  saveLocalReservation(result);
  return result;
}

/**
 * Cancels an active reservation and releases the held capacity.
 */
export async function cancelReservation(
  reservationId: string,
  reason?: string
): Promise<ReservationResponse> {
  const resp = await fetch(`${BACKEND_URL}/api/shelters/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reservation_id: reservationId,
      reason: reason
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Cancellation failed (HTTP ${resp.status})`);
  }

  const result: ReservationResponse = await resp.json();
  clearLocalReservation();
  return result;
}

/**
 * Authorized responder / staff updates verified operational capacity.
 */
export async function staffUpdateCapacity(
  shelterId: string,
  isOperational: boolean,
  verifiedCapacity?: number,
  occupiedCount?: number,
  notes?: string,
  staffPin?: string,
  isSimulated?: boolean
): Promise<ShelterOccupancyInfo> {
  const cleanPin = (staffPin || '').trim();
  if (!cleanPin) {
    throw new Error('Authorized responder PIN is required to update operational capacity.');
  }

  const resp = await fetch(`${BACKEND_URL}/api/shelters/staff/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shelter_id: shelterId,
      is_operational: isOperational,
      verified_operational_capacity: verifiedCapacity,
      occupied_count: occupiedCount,
      verification_notes: notes,
      staff_pin: cleanPin,
      is_simulated: isSimulated,
      updated_by: "Taluk Incident Command Staff"
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Staff update failed (HTTP ${resp.status})`);
  }

  const updatedOcc: ShelterOccupancyInfo = await resp.json();

  // Also synchronize to localStorage cache so offline mode maintains verified values
  try {
    const rawCache = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (Array.isArray(parsed.facilities)) {
        parsed.facilities = parsed.facilities.map((f: ReliefFacility) =>
          f.id === shelterId ? { ...f, occupancy: updatedOcc } : f
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      }
    }
  } catch (e) {
    console.warn("Could not write updated shelter to localStorage cache:", e);
  }

  return updatedOcc;
}

/**
 * Retrieves intelligent safe-spot recommendation based on live GPS and group size.
 */
export async function getShelterRecommendation(
  userLat: number,
  userLng: number,
  groupSize: number,
  districtId?: string
): Promise<ShelterRecommendationResponse> {
  const resp = await fetch(`${BACKEND_URL}/api/shelters/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_lat: userLat,
      user_lng: userLng,
      group_size: groupSize,
      district_id: districtId && districtId !== "all" ? districtId : undefined,
      max_distance_km: 75.0
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `Recommendation failed (HTTP ${resp.status})`);
  }

  return await resp.json();
}

// ---------------------------------------------------------------------------
// LOCAL STORAGE ACTIVE RESERVATION HELPERS
// ---------------------------------------------------------------------------

export function saveLocalReservation(res: ReservationResponse): void {
  try {
    localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(res));
  } catch (e) {
    console.warn("Could not cache active reservation to localStorage:", e);
  }
}

export function getLocalReservation(): ReservationResponse | null {
  try {
    const raw = localStorage.getItem(RESERVATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function clearLocalReservation(): void {
  try {
    localStorage.removeItem(RESERVATION_STORAGE_KEY);
  } catch (e) {
    // Ignore
  }
}

