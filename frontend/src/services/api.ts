const API_BASE = "http://localhost:8000/api";

export interface LocationInfo {
  id: string;
  name: string;
  malayalam_name?: string;
  latitude: number;
  longitude: number;
  elevation_m: number;
  basin: string;
  vulnerability_notes: string;
  terrain_type?: string;
  is_coastal?: boolean;
  region?: string;
  data_coverage_status?: "FULL_MULTI_FACTOR" | "RIVERINE_AND_WEATHER" | "WEATHER_AND_SOIL";
  bounds?: [number, number][];
}

export interface KeralaGeographyData {
  districts: (LocationInfo & {
    primary_river_basins?: string[];
    key_monitoring_station?: string;
    cwc_gauge_reference?: string;
    river_warning_threshold_m3s?: number;
    river_danger_threshold_m3s?: number;
    bounds: [number, number][];
  })[];
  river_basins: {
    id: string;
    name: string;
    origin: string;
    drainage_area_sqkm: number;
    major_dams: string[];
    cwc_gauge_stations: string[];
    flooding_characteristics: string;
  }[];
  coastal_stations: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    port_type: string;
    benchmark_m_cd: number;
    tidal_range_spring_m: number;
    compound_hazard_type: string;
  }[];
}

export interface HourlyTrendPoint {
  time: string;
  precipitation_mm: number;
  rain_mm: number;
  temperature_2m: number;
  soil_moisture: number;
  is_forecast?: boolean;
}

export interface RiverTelemetry {
  discharge_m3s: number;
  warning_threshold_m3s: number;
  danger_threshold_m3s: number;
  is_warning: boolean;
  discharge_ratio: number;
  status: "NORMAL" | "WATCH" | "DANGER" | "UNAVAILABLE";
  source: string;
}

export interface CoastalTideTelemetry {
  is_coastal_station: boolean;
  tide_level_max_m: number;
  tidal_range_m: number;
  is_spring_tide: boolean;
  wave_height_m?: number;
  compound_backwater_risk: number;
  source: string;
}

export interface WeatherData {
  location_id: string;
  location_name: string;
  latitude: number;
  longitude: number;
  observed_time: string;
  current_temperature_c: number;
  current_humidity_pct: number;
  current_wind_speed_kmh: number;
  current_surface_pressure_hpa: number;
  past_24h_precip_mm: number;
  past_72h_precip_mm: number;
  past_120h_precip_mm: number;
  forecast_next_24h_precip_mm: number;
  current_surface_soil_moisture: number;
  current_deep_soil_moisture: number;
  data_source: string;
  freshness: string;
  cache_age_seconds: number;
  river?: RiverTelemetry;
  coastal?: CoastalTideTelemetry;
  hourly_trend: HourlyTrendPoint[];
}

export interface FactorContribution {
  feature: string;
  label: string;
  value: number;
  unit: string;
  baseline_normal: number;
  deviation_ratio: number;
  impact_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  description: string;
}

export interface PredictionData {
  location_id: string;
  location_name: string;
  prediction_timestamp: string;
  weather_observed_at: string;
  horizon_hours: number;
  calibrated_risk_probability: number;
  baseline_risk_probability: number;
  risk_level: "LOW" | "MODERATE_ALERT" | "HIGH_WARNING";
  risk_level_code: number;
  primary_flood_mechanism: "RIVERINE_OVERFLOW" | "URBAN_PLUVIAL" | "COASTAL_COMPOUND" | "LOW_RISK";
  key_factors: FactorContribution[];
  input_feature_snapshot: Record<string, any>;
  model_version: string;
  model_name: string;
  features_used_count: number;
  data_source: string;
  data_freshness: string;
  is_rule_based?: boolean;
  risk_estimate_type?: string;
  is_experimental: boolean;
  is_simulation?: boolean;
  simulation_scenario?: string;
  rule_vs_model_reason?: string;
  disclaimer: string;
  is_data_insufficient?: boolean;
}

export interface AlertItem {
  id: number;
  location_id: string;
  location_name: string;
  timestamp: string;
  severity: "INFO" | "ADVISORY" | "WARNING" | "EMERGENCY";
  title: string;
  message: string;
  rule_triggered: string;
  is_official_override: boolean;
  is_test: boolean;
  suppressed_count: number;
}

export interface OfficialAdvisory {
  district: string;
  alert_color: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  issuing_agency: string;
  issued_at: string;
  description: string;
  is_active: boolean;
}

export const api = {
  async getLocations(region = "kerala"): Promise<LocationInfo[]> {
    const url = region ? `${API_BASE}/locations?region=${region}` : `${API_BASE}/locations`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load locations: ${res.statusText}`);
    return res.json();
  },

  async getKeralaGeography(): Promise<KeralaGeographyData> {
    const res = await fetch(`${API_BASE}/geography/kerala`);
    if (!res.ok) throw new Error(`Failed to load Kerala geography: ${res.statusText}`);
    return res.json();
  },

  async getWeather(locationId: string, forceRefresh = false): Promise<WeatherData> {
    const res = await fetch(`${API_BASE}/weather/${locationId}?force_refresh=${forceRefresh}`);
    if (!res.ok) throw new Error(`Weather error (${res.status}): ${await res.text()}`);
    return res.json();
  },

  async getPrediction(
    locationId: string,
    modelVersion = "2.0.0",
    manualOverrideMm?: number,
    simulationScenario?: string
  ): Promise<PredictionData> {
    const payload: any = {
      location_id: locationId,
      model_version: modelVersion
    };
    if (manualOverrideMm !== undefined) {
      payload.manual_forecast_override_mm = manualOverrideMm;
    }
    if (simulationScenario) {
      payload.simulation_scenario = simulationScenario;
    }
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Prediction failed (${res.status}): ${await res.text()}`);
    return res.json();
  },

  async getAlerts(): Promise<AlertItem[]> {
    const res = await fetch(`${API_BASE}/alerts`);
    if (!res.ok) throw new Error("Failed to load alerts");
    return res.json();
  },

  async triggerTestAlert(locationId: string, severity = "WARNING"): Promise<AlertItem> {
    const res = await fetch(`${API_BASE}/alerts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        severity: severity,
        title: `[DRILL TEST] Simulating ${severity} Flood Warning`,
        message: `Simulation exercise for ${locationId}. Verification of in-app notification routing and event logging.`
      })
    });
    if (!res.ok) throw new Error("Failed to trigger test alert");
    return res.json();
  },

  async getPredictionHistory(locationId?: string): Promise<any[]> {
    const url = locationId ? `${API_BASE}/predictions?location_id=${locationId}` : `${API_BASE}/predictions`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch prediction history");
    return res.json();
  },

  async getAdvisories(): Promise<OfficialAdvisory[]> {
    const res = await fetch(`${API_BASE}/advisories`);
    if (!res.ok) return [];
    return res.json();
  },

  async getModelComparison(): Promise<any> {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) return null;
    return res.json();
  },

  // --- SOS Operations & Fleet Command ---
  async getSosIncidents(districtId?: string, includeDemo = false): Promise<SosIncident[]> {
    const params = new URLSearchParams();
    if (districtId && districtId !== 'all') {
      params.append('district', districtId);
    }
    if (includeDemo) {
      params.append('include_demo', 'true');
    }
    const qs = params.toString();
    const url = qs ? `${API_BASE}/sos?${qs}` : `${API_BASE}/sos`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch SOS incidents (${res.status})`);
    return res.json();
  },

  async updateSosStatus(
    incidentId: string,
    payload: {
      status: string;
      assigned_boat_id?: string | null;
      assigned_boat_name?: string | null;
      mission_phase?: string | null;
      notes?: string | null;
      priority_override_level?: string | null;
      priority_override_score?: number | null;
      priority_override_reason?: string | null;
    }
  ): Promise<SosIncident> {
    const res = await fetch(`${API_BASE}/sos/${encodeURIComponent(incidentId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to update incident status (${res.status})`);
    return res.json();
  },

  async acknowledgeSosByRescuer(incidentId: string, rescuerName = "ResQNet Command Unit", notes = "Acknowledged by incident commander"): Promise<SosIncident> {
    const res = await fetch(`${API_BASE}/sos/${encodeURIComponent(incidentId)}/rescuer-ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rescuerName, notes, missionPhase: "en_route" })
    });
    if (!res.ok) throw new Error(`Failed to acknowledge incident (${res.status})`);
    return res.json();
  },

  async getStopForwardingMessageIds(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/sos/stop-forwarding`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.confirmed_message_ids || [];
  },

  async getIncidentMessages(incidentId: string): Promise<IncidentMessage[]> {
    const res = await fetch(`${API_BASE}/sos/${encodeURIComponent(incidentId)}/messages`);
    if (!res.ok) throw new Error(`Failed to fetch incident messages (${res.status})`);
    return res.json();
  },

  async sendIncidentMessage(
    incidentId: string,
    messageText: string,
    senderRole: "responder" | "citizen" = "responder",
    senderName = "Incident Command",
    deliveryChannel = "INTERNET"
  ): Promise<IncidentMessage> {
    const res = await fetch(`${API_BASE}/sos/${encodeURIComponent(incidentId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageText,
        senderRole,
        senderName,
        deliveryChannel
      })
    });
    if (!res.ok) throw new Error(`Failed to send incident message (${res.status})`);
    return res.json();
  },

  async acknowledgeIncidentMessage(
    incidentId: string,
    messageId: string,
    status = "CONFIRMED_RECEIVED",
    acknowledgedBy = "responder_console"
  ): Promise<IncidentMessage> {
    const res = await fetch(`${API_BASE}/sos/${encodeURIComponent(incidentId)}/messages/${encodeURIComponent(messageId)}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, acknowledgedBy })
    });
    if (!res.ok) throw new Error(`Failed to acknowledge message (${res.status})`);
    return res.json();
  },

  async getRescueBoats(districtId?: string): Promise<RescueBoat[]> {
    const url = districtId && districtId !== 'all'
      ? `${API_BASE}/boats?district=${encodeURIComponent(districtId)}`
      : `${API_BASE}/boats`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch rescue vessels (${res.status})`);
    return res.json();
  },

  async updateBoatStatus(boatId: string, status: string, missionPhase = "standby"): Promise<RescueBoat> {
    const res = await fetch(`${API_BASE}/boats/${encodeURIComponent(boatId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, mission_phase: missionPhase })
    });
    if (!res.ok) throw new Error(`Failed to update vessel status (${res.status})`);
    return res.json();
  },

  async assignBoat(boatId: string, incidentId: string, districtId = "ernakulam"): Promise<any> {
    const res = await fetch(`${API_BASE}/boats/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boat_id: boatId,
        incident_id: incidentId,
        district_id: districtId
      })
    });
    if (!res.ok) throw new Error(`Failed to assign vessel (${res.status})`);
    return res.json();
  },

  async getRiskZones(districtId?: string): Promise<any[]> {
    const url = districtId && districtId !== 'all'
      ? `${API_BASE}/risk-zones?district=${encodeURIComponent(districtId)}`
      : `${API_BASE}/risk-zones`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  },

  // --- Scalable Safety Broadcasts ---
  async getSafetyBroadcasts(districtId?: string): Promise<SafetyBroadcast[]> {
    const url = districtId && districtId !== 'all'
      ? `${API_BASE}/broadcasts?district=${encodeURIComponent(districtId)}`
      : `${API_BASE}/broadcasts`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch safety broadcasts (${res.status})`);
    return res.json();
  },

  async getSafetyBroadcast(broadcastId: string): Promise<SafetyBroadcast> {
    const res = await fetch(`${API_BASE}/broadcasts/${encodeURIComponent(broadcastId)}`);
    if (!res.ok) throw new Error(`Failed to fetch broadcast ${broadcastId}`);
    return res.json();
  },

  async createSafetyBroadcast(payload: {
    title: string;
    message: string;
    district_id?: string;
    deadline_seconds?: number;
    participant_ids?: string[];
  }): Promise<SafetyBroadcast> {
    const res = await fetch(`${API_BASE}/broadcasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to create broadcast (${res.status})`);
    return res.json();
  },

  async escalateParticipant(broadcastId: string, participantId: string, note = "Command Escalation to Official SOS"): Promise<any> {
    const res = await fetch(`${API_BASE}/broadcasts/${encodeURIComponent(broadcastId)}/escalate/${encodeURIComponent(participantId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note })
    });
    if (!res.ok) throw new Error(`Failed to escalate participant (${res.status})`);
    return res.json();
  },

  async getParticipants(districtId?: string): Promise<any[]> {
    const url = districtId && districtId !== 'all'
      ? `${API_BASE}/participants?district=${encodeURIComponent(districtId)}`
      : `${API_BASE}/participants`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  },

  async registerParticipant(payload: {
    id?: string;
    name: string;
    phone_number?: string;
    district_id?: string;
    device_id?: string;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to register participant (${res.status})`);
    return res.json();
  }
};

export interface SosIncident {
  id: string;
  message_id?: string;
  district_id: string;
  district_name: string;
  location_name: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m?: number | null;
  category: string;
  description: string;
  people_count: number;
  vulnerability_flags: string[];
  priority_score: number;
  priority_level: string;
  priority_reasons: string[];
  response_status: string;
  assigned_boat_id?: string | null;
  assigned_boat_name?: string | null;
  mission_phase?: string | null;
  delivery_status: string;
  delivery_channel?: string;
  relay_node_id?: string | null;
  relayed_at?: string | null;
  hop_count: number;
  origin_device_id?: string | null;
  participant_id?: string | null;
  broadcast_id?: string | null;
  rescuer_name?: string | null;
  acknowledged_by_server_at?: string | null;
  acknowledged_by_rescuer_at?: string | null;
  is_demo?: boolean;
}

export interface IncidentMessage {
  id: string;
  incident_id: string;
  sender_role: "citizen" | "responder";
  sender_name?: string | null;
  message_text: string;
  created_at: string;
  delivery_status: "SAVED_ON_SERVER" | "QUEUED_FOR_DELIVERY" | "SENT_TO_DEVICE" | "CONFIRMED_RECEIVED" | "DELIVERY_FAILED" | "UNKNOWN" | string;
  delivery_channel?: string;
  delivered_at?: string | null;
  acknowledged_at?: string | null;
}

export interface RescueBoat {
  id: string;
  district_id: string;
  district_name: string;
  name: string;
  agency: string;
  type: string;
  capacity: number;
  commander?: string | null;
  crew_count: number;
  contact?: string | null;
  base_name?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  assigned_incident_id?: string | null;
  assigned_incident_location?: string | null;
  mission_phase: string;
  fuel_percent: number;
  rescues_completed: number;
  updated_at: string;
}

export interface BroadcastRecipient {
  participant_id: string;
  name: string;
  phone_number?: string | null;
  district_id: string;
  delivery_status: string;
  delivered_at?: string | null;
  safety_status: string;
  responded_at?: string | null;
  response_note?: string | null;
  reported_latitude?: number | null;
  reported_longitude?: number | null;
  reported_accuracy_m?: number | null;
  last_known_latitude?: number | null;
  last_known_longitude?: number | null;
  last_known_location_time?: string | null;
  is_escalated: boolean;
  linked_sos_id?: string | null;
}

export interface SafetyBroadcast {
  id: string;
  title: string;
  message: string;
  district_id: string;
  target_group: string;
  status: string;
  deadline_seconds: number;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
  seconds_remaining: number;
  total_recipients: number;
  safe_count: number;
  help_count: number;
  awaiting_count: number;
  unresponsive_count: number;
  recipients: BroadcastRecipient[];
}
