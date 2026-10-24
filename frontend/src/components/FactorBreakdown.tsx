import React, { useState } from 'react';
import { Sliders, Play, RotateCcw, CloudDrizzle, CloudRain, AlertTriangle } from 'lucide-react';
import type { FactorContribution, PredictionData } from '../services/api';

interface FactorBreakdownProps {
  factors: FactorContribution[];
  onSimulateRainfall: (rainfallMm: number) => void;
  isSimulating: boolean;
  activeScenario?: string | null;
  onSelectScenario?: (scenario: string) => void;
  onResetSimulation: () => void;
  prediction?: PredictionData | null;
}

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({
  factors,
  onSimulateRainfall,
  isSimulating,
  activeScenario,
  onSelectScenario,
  onResetSimulation,
  prediction
}) => {
  const [simRain, setSimRain] = useState<number>(140);

  const getImpactBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <span className="badge badge-severe">Critical</span>;
      case 'HIGH':
        return <span className="badge badge-warning">High</span>;
      case 'MODERATE':
        return <span className="badge badge-watch">Moderate</span>;
      default:
        return <span className="badge badge-low">Normal</span>;
    }
  };

  return (
    <div className="dash-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            <Sliders size={16} color="var(--brand-teal)" />
            Hydrological Risk Factor Contributions & Simulation Sandbox
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Feature deviations relative to monsoon baselines, with dev-only synthetic scenario evaluation
          </p>
        </div>

        {/* Action Controls: Presets + Custom Slider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          backgroundColor: 'var(--bg-surface-subtle)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-light)'
        }}>
          {/* Preset Scenario Buttons */}
          {onSelectScenario && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Presets:</span>
              <button
                type="button"
                onClick={() => onSelectScenario('NORMAL')}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeScenario === 'NORMAL' ? '1px solid var(--risk-low)' : '1px solid var(--border-light)',
                  backgroundColor: activeScenario === 'NORMAL' ? 'var(--risk-low-bg)' : 'transparent',
                  color: activeScenario === 'NORMAL' ? 'var(--risk-low)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Simulate normal precipitation (12mm forecast, 22mm past 72h)"
              >
                <CloudDrizzle size={12} />
                Normal (12mm)
              </button>
              <button
                type="button"
                onClick={() => onSelectScenario('HEAVY_RAINFALL')}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeScenario === 'HEAVY_RAINFALL' ? '1px solid var(--risk-watch)' : '1px solid var(--border-light)',
                  backgroundColor: activeScenario === 'HEAVY_RAINFALL' ? 'var(--risk-watch-bg)' : 'transparent',
                  color: activeScenario === 'HEAVY_RAINFALL' ? 'var(--risk-watch)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Simulate IMD Orange Alert downpour (85mm forecast, 95mm past 72h, 76% soil sat)"
              >
                <CloudRain size={12} />
                Heavy Rain (85mm)
              </button>
              <button
                type="button"
                onClick={() => onSelectScenario('EXTREME_RAINFALL')}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeScenario === 'EXTREME_RAINFALL' ? '1px solid var(--risk-severe)' : '1px solid var(--border-light)',
                  backgroundColor: activeScenario === 'EXTREME_RAINFALL' ? 'var(--risk-severe-bg)' : 'transparent',
                  color: activeScenario === 'EXTREME_RAINFALL' ? 'var(--risk-severe)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Simulate IMD Red Alert cloudburst (185mm forecast, 235mm past 72h, river overflow)"
              >
                <AlertTriangle size={12} />
                Extreme Deluge (185mm)
              </button>
            </div>
          )}

          <div style={{ height: '16px', width: '1px', backgroundColor: 'var(--border-light)', margin: '0 4px' }} />

          {/* Custom Slider */}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Custom:</span>
          <input
            type="range"
            min="20"
            max="300"
            step="10"
            value={simRain}
            onChange={(e) => setSimRain(Number(e.target.value))}
            style={{ width: '80px', cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
          />
          <span className="mono" style={{ fontSize: '0.72rem', fontWeight: 700, minWidth: '45px', color: 'var(--text-primary)' }}>
            {simRain}mm
          </span>
          <button
            className="btn-primary"
            onClick={() => onSimulateRainfall(simRain)}
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
          >
            <Play size={10} fill="#FFFFFF" />
            Apply
          </button>
          {isSimulating && (
            <button
              className="btn-secondary"
              onClick={onResetSimulation}
              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
              title="Reset to live NWP forecast"
            >
              <RotateCcw size={10} />
              Reset Live
            </button>
          )}
        </div>
      </div>

      {/* Prominent Simulation Notification & Provenance Banner */}
      {isSimulating && (
        <div style={{
          backgroundColor: 'rgba(13, 148, 136, 0.08)',
          border: '1px solid rgba(13, 148, 136, 0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '0.78rem',
          color: 'var(--text-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div>
            <strong>[DEVELOPMENT SIMULATION MODE ACTIVE]</strong>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              Scenario: <strong>{activeScenario ? activeScenario : `Custom (${simRain}mm)`}</strong>.
              Inputs pass through the existing ML pipeline; real ERA5, GloFAS and coastal telemetry remain completely untouched.
            </span>
            {prediction?.rule_vs_model_reason && (
              <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <strong>Decision Provenance:</strong> {prediction.rule_vs_model_reason}
              </div>
            )}
          </div>
          <button
            onClick={onResetSimulation}
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              backgroundColor: 'transparent',
              border: '1px solid var(--brand-teal)',
              color: 'var(--brand-teal)',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer'
            }}
          >
            Exit Simulation
          </button>
        </div>
      )}

      {/* Factor Cards List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        {factors && factors.length > 0 ? (
          factors.map((factor, idx) => (
            <div 
              key={idx}
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {factor.label}
                </span>
                {getImpactBadge(factor.impact_level)}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {typeof factor.value === 'number' ? factor.value.toFixed(1) : factor.value}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {factor.unit} (baseline: {factor.baseline_normal} {factor.unit})
                </span>
              </div>

              <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                {factor.description}
              </p>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px' }}>
            Telemetry factors are normal or baseline index active.
          </div>
        )}
      </div>
    </div>
  );
};
