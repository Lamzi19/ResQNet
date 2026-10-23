import React from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';

interface ModelComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  comparisonData?: any;
}

export const ModelComparisonModal: React.FC<ModelComparisonModalProps> = ({
  isOpen,
  onClose,
  comparisonData: _comparisonData
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(16, 27, 45, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div 
        className="dash-card-elevated" 
        style={{ 
          width: '100%', 
          maxWidth: '840px', 
          maxHeight: '90vh', 
          overflowY: 'auto', 
          padding: '24px 28px',
          backgroundColor: '#FFFFFF'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} color="var(--brand-teal)" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                ResQNet Model Evaluation & Provenance Audit
              </h2>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Historical benchmark validation and active model architecture registry
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Geographic Integrity Notice */}
        <div style={{
          backgroundColor: 'var(--bg-app)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <AlertCircle size={18} color="var(--brand-teal)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Regional Provenance & Data Integrity:</strong> The quantitative benchmark metrics below reflect the preserved <strong>Coastal Karnataka</strong> evaluation dataset (held-out out-of-time test on 2023–2024 monsoon seasons). The <strong>Kerala-specific</strong> machine-learning pipeline is currently operating in Phase 1 multi-factor telemetry mode while event chronologies are independently compiled.
          </div>
        </div>

        {/* Version Comparison Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '24px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>Architecture Dimension</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>Model v1.0 (Rainfall Baseline)</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--brand-teal)' }}>Model v2.0 (Multi-Factor Coastal)</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Feature Count & Vectors</td>
              <td style={{ padding: '10px 12px' }}>15 Hydrometeorological Features</td>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--brand-teal)' }}>20 Multi-Factor Hydrometric Features</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Hydraulic Inputs</td>
              <td style={{ padding: '10px 12px' }}>Rainfall (24h/72h/120h) + Soil Moisture</td>
              <td style={{ padding: '10px 12px' }}>+ River Discharge (GloFAS/CWC) + Astronomical Tide</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Out-of-Time F1 Score</td>
              <td style={{ padding: '10px 12px' }}>0.514 (Baseline Random Forest)</td>
              <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--risk-low)' }}>0.650 (+26.3% balanced lift)</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Coastal Estuarine Recall</td>
              <td style={{ padding: '10px 12px' }}>85.0% (Missed tidal stalling events)</td>
              <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--risk-low)' }}>96.7% (+11.7% surge detection)</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>False Alarm Rate</td>
              <td style={{ padding: '10px 12px' }}>18.2% on flash downpours</td>
              <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--risk-low)' }}>12.0% (-34.1% reduction)</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Artifact File Path</td>
              <td style={{ padding: '10px 12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>flood_model_pipeline_v1.joblib</td>
              <td style={{ padding: '10px 12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>flood_model_pipeline_v2_coastal.joblib</td>
            </tr>
          </tbody>
        </table>

        {/* Kerala Roadmap Section */}
        <div style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          padding: '16px',
          fontSize: '0.76rem'
        }}>
          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Kerala Model Phase Roadmap
          </h4>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: '1.4' }}>
            In accordance with Rule B2 (data integrity), Kerala-specific supervised models will be trained only after assembling a verified disaster event inventory from official KSDMA district disaster records (2018–2024). Operational inference currently employs the multi-factor rule engine and physical thresholds.
          </p>
          <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
            <span>• Verified Districts: <strong>14/14</strong></span>
            <span>• Major Basins: <strong>8 Basins Mapped</strong></span>
            <span>• Target Split: <strong>Chronological 2018-2022 Train / 2023-2024 Test</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
