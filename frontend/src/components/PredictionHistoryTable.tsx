import React from 'react';
import { History } from 'lucide-react';

interface HistoryItem {
  id: number;
  location_id: string;
  timestamp: string;
  risk_probability: number;
  baseline_probability: number;
  risk_level: string;
  forecast_precip_24h_mm: number;
  past_72h_precip_mm: number;
  model_version: string;
  data_freshness: string;
}

interface PredictionHistoryTableProps {
  history: HistoryItem[];
}

export const PredictionHistoryTable: React.FC<PredictionHistoryTableProps> = ({ history }) => {
  return (
    <div className="dash-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            <History size={16} color="var(--brand-teal)" />
            Prediction Audit Trail & Historical Inferences
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Immutable records of generated risk assessments logged for retrospective model validation
          </p>
        </div>
        <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {history.length} logged runs
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Timestamp</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>District / Station</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Risk Tier</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Calibrated Risk</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Forecast (24h)</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Past 72h</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Telemetry Status</th>
              <th style={{ padding: '8px 10px', fontWeight: 600 }}>Model</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 10).map((h) => {
              const isHigh = h.risk_level === 'HIGH_WARNING';
              const isMod = h.risk_level === 'MODERATE_ALERT';
              return (
                <tr 
                  key={h.id} 
                  style={{ 
                    borderBottom: '1px solid var(--border-light)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <td style={{ padding: '8px 10px' }}>
                    {new Date(h.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                    {h.location_id}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className={`badge ${isHigh ? 'badge-severe' : isMod ? 'badge-watch' : 'badge-low'}`}>
                      {h.risk_level}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: '8px 10px', fontWeight: 700 }}>
                    {(h.risk_probability * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {h.forecast_precip_24h_mm.toFixed(1)} mm
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {h.past_72h_precip_mm.toFixed(1)} mm
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                      {h.data_freshness}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    v{h.model_version}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
