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

  async getPrediction(locationId: string, modelVersion = "2.0.0", manualOverrideMm?: number): Promise<PredictionData> {
    const payload: any = { 
      location_id: locationId,
      model_version: modelVersion
    };
    if (manualOverrideMm !== undefined) {
      payload.manual_forecast_override_mm = manualOverrideMm;
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
  }
};
