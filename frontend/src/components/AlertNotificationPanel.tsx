import React, { useState } from 'react';
import { Bell, AlertOctagon, AlertTriangle, Info, X, Send, ShieldAlert } from 'lucide-react';
import type { AlertItem } from '../services/api';

interface AlertNotificationPanelProps {
  alerts: AlertItem[];
  isTestModalOpen: boolean;
  onCloseTestModal: () => void;
  onSendTestAlert: (locationId: string, severity: string) => Promise<void>;
  selectedLocationId: string;
}

export const AlertNotificationPanel: React.FC<AlertNotificationPanelProps> = ({
  alerts,
  isTestModalOpen,
  onCloseTestModal,
  onSendTestAlert,
  selectedLocationId
}) => {
  const [testLoc, setTestLoc] = useState(selectedLocationId);
  const [testSeverity, setTestSeverity] = useState('WARNING');
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendTest = async () => {
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      await onSendTestAlert(testLoc, testSeverity);
      setConfirmed(false);
      onCloseTestModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'EMERGENCY':
        return <span className="badge badge-severe"><AlertOctagon size={11} /> Emergency</span>;
      case 'WARNING':
        return <span className="badge badge-warning"><AlertTriangle size={11} /> Warning</span>;
      case 'ADVISORY':
        return <span className="badge badge-watch"><AlertTriangle size={11} /> Advisory</span>;
      default:
        return <span className="badge badge-neutral"><Info size={11} /> Info</span>;
    }
  };

  return (
    <>
      <div className="dash-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
              <Bell size={16} color="var(--brand-teal)" />
              Early Warning & In-App Notification Audit Trail
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Logged early warning triggers, official state directive overrides, and operator simulation records
            </p>
          </div>
          <span className="badge badge-neutral">
            {alerts.length} Logged Events
          </span>
        </div>

        {/* Alerts List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
          {alerts && alerts.length > 0 ? (
            alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {getSeverityBadge(alert.severity)}
                    {alert.is_test && (
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        DEMO / DRILL TEST
                      </span>
                    )}
                    {alert.is_official_override && (
                      <span className="badge badge-severe" style={{ fontSize: '0.65rem' }}>
                        OFFICIAL STATE OVERRIDE
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {alert.location_name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                    {alert.message}
                  </p>
                </div>

                {alert.suppressed_count > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    Suppressed: {alert.suppressed_count}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px', textAlign: 'center' }}>
              No active warnings or recent dispatch logs.
            </div>
          )}
        </div>
      </div>

      {/* Operator Drill Simulation Modal */}
      {isTestModalOpen && (
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
          zIndex: 1200,
          padding: '20px'
        }}>
          <div 
            className="dash-card-elevated"
            style={{ width: '100%', maxWidth: '520px', padding: '24px', backgroundColor: '#FFFFFF' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="var(--risk-warning)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Operator Drill Simulation Test
                </h3>
              </div>
              <button onClick={onCloseTestModal} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
              This operator action triggers an in-app simulation test event recorded to the SQLite audit log. <strong>It is strictly a simulation drill and is never broadcast as an official disaster advisory.</strong>
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Target District:
              </label>
              <input
                type="text"
                value={testLoc}
                onChange={(e) => setTestLoc(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.82rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Simulated Severity Tier:
              </label>
              <select
                value={testSeverity}
                onChange={(e) => setTestSeverity(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.82rem'
                }}
              >
                <option value="ADVISORY">Advisory (Watch Level)</option>
                <option value="WARNING">Warning (High Level)</option>
                <option value="EMERGENCY">Emergency (Severe Level)</option>
              </select>
            </div>

            {/* Mandatory Safety Confirmation Checkbox */}
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <input
                type="checkbox"
                id="confirm-drill"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                style={{ accentColor: 'var(--brand-teal)', cursor: 'pointer' }}
              />
              <label htmlFor="confirm-drill" style={{ fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                I confirm this is an authorized system simulation drill and will be logged with the [DEMO/TEST] tag.
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn-secondary" onClick={onCloseTestModal}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSendTest}
                disabled={!confirmed || isSubmitting}
                style={{ opacity: confirmed ? 1 : 0.5 }}
              >
                <Send size={12} />
                {isSubmitting ? 'Logging Drill...' : 'Dispatch Simulation Drill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
