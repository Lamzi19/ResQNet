import React from 'react';
import {
  ShieldCheck, AlertTriangle, AlertOctagon, CloudRain,
  Waves, Anchor, Info, Sparkles, Database
} from 'lucide-react';
import type { PredictionData, WeatherData, LocationInfo } from '../services/api';

interface RiskOverviewCardsProps {
  prediction: PredictionData | null;
  weather: WeatherData | null;
  location: LocationInfo | null;
  currentModelVersion: string;
  onToggleModelVersion: (version: string) => void;
}

export const RiskOverviewCards: React.FC<RiskOverviewCardsProps> = ({
  prediction,
  weather,
  location,
  currentModelVersion,
  onToggleModelVersion
}) => {
  if (!prediction || !weather) return null;

  const isSevere = prediction.risk_level === 'HIGH_WARNING';
  const isWatch = prediction.risk_level === 'MODERATE_ALERT';
  const probPercent = (prediction.calibrated_risk_probability * 100).toFixed(1);

  // Semantic card coloring based on risk level
  let statusBadge = <span className="badge badge-low"><ShieldCheck size={13} /> Low Risk</span>;
  let summaryCardBorder = 'var(--border-light)';
  let summaryCardBg = 'var(--bg-surface)';

  if (isSevere) {
    statusBadge = <span className="badge badge-severe"><AlertOctagon size={13} /> High Warning</span>;
    summaryCardBorder = 'var(--risk-severe-border)';
    summaryCardBg = 'var(--risk-severe-bg)';
  } else if (isWatch) {
    statusBadge = <span className="badge badge-watch"><AlertTriangle size={13} /> Watch Advisory</span>;
    summaryCardBorder = 'var(--risk-watch-border)';
    summaryCardBg = 'var(--risk-watch-bg)';
  }

  const getMechanismBadge = (mech: string) => {
    switch (mech) {
      case 'COASTAL_COMPOUND':
        return <span className="badge badge-watch"><Anchor size={12} /> Coastal Compound Inundation</span>;
      case 'RIVERINE_OVERFLOW':
        return <span className="badge badge-warning"><Waves size={12} /> Riverine Overflow</span>;
      case 'URBAN_PLUVIAL':
        return <span className="badge badge-watch"><CloudRain size={12} /> Urban Pluvial / Waterlogging</span>;
      default:
        return <span className="badge badge-low">Normal Runoff Conditions</span>;
    }
  };

  const soilSatPercent = Math.min(100, Math.round(weather.current_surface_soil_moisture / 0.50 * 100));
  const river = weather.river;
  const coastal = weather.coastal;
  const isCoastal = location?.is_coastal ?? false;

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Model Context & Provenance Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 16px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Sparkles size={16} color="var(--brand-teal)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Hydrological Model:
          </span>
          <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {prediction.model_name} (v{prediction.model_version})
          </span>
          <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
            {prediction.features_used_count} Features
          </span>
          {getMechanismBadge(prediction.primary_flood_mechanism)}
          {location?.region === 'kerala' && (
            <span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>
              <Database size={10} /> Kerala Operational Telemetry
            </span>
          )}
          {prediction.is_simulation && (
            <span className="badge badge-warning" style={{ fontSize: '0.68rem', backgroundColor: 'rgba(217, 154, 22, 0.15)', color: '#B45309', border: '1px solid #D99A16' }}>
              Synthetic Simulation Pipeline
            </span>
          )}
        </div>

        {/* Model Switcher with Honest Regional Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => onToggleModelVersion('1.0.0')}
            style={{
              backgroundColor: currentModelVersion === '1.0.0' ? 'var(--brand-teal)' : 'var(--bg-surface-subtle)',
              border: currentModelVersion === '1.0.0' ? '1px solid var(--brand-teal)' : '1px solid var(--border-light)',
              color: currentModelVersion === '1.0.0' ? '#FFFFFF' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="15-feature rainfall & antecedent soil baseline pipeline"
          >
            v1.0 (Rainfall Baseline)
          </button>
          <button
            onClick={() => onToggleModelVersion('2.0.0')}
            style={{
              backgroundColor: currentModelVersion === '2.0.0' ? 'var(--brand-teal)' : 'var(--bg-surface-subtle)',
              border: currentModelVersion === '2.0.0' ? '1px solid var(--brand-teal)' : '1px solid var(--border-light)',
              color: currentModelVersion === '2.0.0' ? '#FFFFFF' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="20-feature coastal & hydrometeorological multi-factor pipeline"
          >
            v2.0 (Multi-Factor)
          </button>
        </div>
      </div>

      {/* Primary Key Indicators Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px'
      }}>
        {/* 1. Primary Risk Estimate Card */}
        <div
          className="dash-card"
          style={{
            padding: '20px',
            backgroundColor: summaryCardBg,
            borderColor: summaryCardBorder
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              24-Hour Inundation Estimate
            </span>
            {statusBadge}
          </div>

          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: isSevere ? 'var(--risk-severe)' : isWatch ? 'var(--risk-watch)' : 'var(--risk-low)' }}>
                {probPercent}%
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {prediction.is_rule_based || location?.region === 'kerala' ? 'Rule-based flood-risk estimate' : 'calibrated ML probability'}
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '8px' }}>
              Horizon: <strong>24 Hours</strong> | Freshness: <strong>{prediction.is_simulation ? 'SYNTHETIC_SIM' : weather.freshness}</strong>
            </p>

            <div style={{
              padding: '6px 10px',
              backgroundColor: 'rgba(23, 43, 77, 0.04)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)'
            }}>
              <div>
                <span>Method: {prediction.is_rule_based || location?.region === 'kerala' ? 'IMD/CWC Physical Criteria' : 'Random Forest v' + prediction.model_version}</span>
                <span style={{ float: 'right' }}>Inputs: {prediction.features_used_count} Factors</span>
              </div>
              {prediction.rule_vs_model_reason && (
                <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.06)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {prediction.rule_vs_model_reason}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Precipitation Card */}
        <div className="dash-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Forecast Precipitation (24h) {prediction.is_simulation && <span style={{ color: '#B45309', fontWeight: 700 }}>[SIMULATED]</span>}
            </span>
            <CloudRain size={18} color="var(--brand-teal)" />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {prediction.input_feature_snapshot?.forecast_precip_24h_mm !== undefined
                ? prediction.input_feature_snapshot.forecast_precip_24h_mm.toFixed(1)
                : weather.forecast_next_24h_precip_mm}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>mm / 24h</span>
          </div>

          <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div>
              Past 72h Accumulation: <strong>
                {prediction.input_feature_snapshot?.past_72h_precip_mm !== undefined
                  ? `${prediction.input_feature_snapshot.past_72h_precip_mm.toFixed(1)} mm`
                  : `${weather.past_72h_precip_mm} mm`}
              </strong>
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
              {prediction.is_simulation
                ? `Scenario: ${prediction.simulation_scenario || 'Custom Simulation'}`
                : `5-Day Total: ${weather.past_120h_precip_mm} mm (Soil Antecedent Index)`}
            </div>
          </div>
        </div>

        {/* 3. River Discharge Card (Honest Modelled GloFAS Telemetry) */}
        <div className="dash-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Modelled GloFAS River Discharge
            </span>
            <Waves size={18} color="#2563EB" />
          </div>

          {river && river.discharge_m3s > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: river.is_warning ? 'var(--risk-warning)' : 'var(--text-primary)' }}>
                  {river.discharge_m3s}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>m³/s (GloFAS Modelled)</span>
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                CWC Warning Threshold: <strong>{river.warning_threshold_m3s} m³/s</strong>
                {river.discharge_ratio >= 1.0 && (
                  <span style={{ color: 'var(--risk-severe)', display: 'block', fontWeight: 600, marginTop: '2px' }}>
                    ⚠️ River discharge exceeding channel capacity!
                  </span>
                )}
                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px' }}>
                  Basin: {location?.basin || 'Local Watershed'} | Source: {river.source || 'GloFAS Simulation'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <Info size={16} />
                <span>Station telemetry in calibration</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                CWC gauge station reference active ({location?.basin || 'Basin'}). Direct live gauge: GloFAS basin modelled.
              </p>
            </div>
          )}
        </div>

        {/* 4. Coastal / Soil Moisture Telemetry */}
        <div className="dash-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {isCoastal ? 'Astronomical Tide Prediction' : 'Topsoil Moisture & Runoff'}
            </span>
            {isCoastal ? <Anchor size={18} color="#7C3AED" /> : <Waves size={18} color="var(--risk-low)" />}
          </div>

          {isCoastal && coastal ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {coastal.tide_level_max_m}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>m CD (Peak Astronomical)</span>
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Spring Tide: <strong>{coastal.is_spring_tide ? 'Active' : 'Neap'}</strong> | Range: {coastal.tidal_range_m}m
                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px' }}>
                  Survey of India Cochin Port harmonic baseline. Actual sea surge decoupled.
                </span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {soilSatPercent}%
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>saturation</span>
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Surface Volumetric: <strong>{weather.current_surface_soil_moisture} m³/m³</strong>
                <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Deep Soil: {weather.current_deep_soil_moisture} m³/m³ (Inland Ghats Catchment)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
