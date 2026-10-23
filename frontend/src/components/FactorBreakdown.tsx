import React, { useState } from 'react';
import { Sliders, Play, RotateCcw } from 'lucide-react';
import type { FactorContribution } from '../services/api';

interface FactorBreakdownProps {
  factors: FactorContribution[];
  onSimulateRainfall: (rainfallMm: number) => void;
  isSimulating: boolean;
  onResetSimulation: () => void;
}

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({
  factors,
  onSimulateRainfall,
  isSimulating,
  onResetSimulation
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
            Hydrological Risk Factor Contributions
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Feature deviations relative to monsoon seasonal baselines influencing the prediction
          </p>
        </div>

        {/* Simulation Sandbox Trigger */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'var(--bg-surface-subtle)',
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-light)'
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Stress Test:</span>
          <input
            type="range"
            min="20"
            max="300"
            step="10"
            value={simRain}
            onChange={(e) => setSimRain(Number(e.target.value))}
            style={{ width: '100px', cursor: 'pointer', accentColor: 'var(--brand-teal)' }}
          />
          <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '55px', color: 'var(--text-primary)' }}>
            {simRain} mm
          </span>
          <button
            className="btn-primary"
            onClick={() => onSimulateRainfall(simRain)}
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            <Play size={11} fill="#FFFFFF" />
            Simulate
          </button>
          {isSimulating && (
            <button
              className="btn-secondary"
              onClick={onResetSimulation}
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              title="Reset to live NWP forecast"
            >
              <RotateCcw size={11} />
              Live
            </button>
          )}
        </div>
      </div>

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
