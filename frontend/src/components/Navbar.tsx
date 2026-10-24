import React from 'react';
import { Shield, AlertTriangle, Sparkles, BellRing, Compass, LifeBuoy } from 'lucide-react';
import type { OfficialAdvisory } from '../services/api';

interface NavbarProps {
  advisories: OfficialAdvisory[];
  onOpenTestModal: () => void;
  onOpenComparisonModal: () => void;
  onOpenShelterModal?: () => void;
  onOpenSosModal?: () => void;
  activeAlertCount: number;
  activeSosCount?: number;
  dataFreshness?: string;
  isBackendOnline?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  advisories, 
  onOpenTestModal, 
  onOpenComparisonModal, 
  onOpenShelterModal,
  onOpenSosModal,
  activeAlertCount,
  activeSosCount = 0,
  dataFreshness = 'LIVE',
  isBackendOnline = true
}) => {
  const activeAdvisory = advisories.find(a => a.is_active);

  return (
    <header style={{
      backgroundColor: 'var(--bg-navy-header)',
      borderBottom: '1px solid var(--border-navy)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '12px 24px',
      color: 'var(--text-inverse)'
    }}>
      <div style={{
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Brand & Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--brand-teal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <Shield size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                ResQNet
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--brand-cyan)',
                backgroundColor: 'rgba(34, 184, 207, 0.12)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(34, 184, 207, 0.25)'
              }}>
                Prototype v2.1
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-inverse-muted)', margin: 0 }}>
              Kerala Flood Intelligence & Early Warning System
            </p>
          </div>
        </div>

        {/* Official Advisory Status Banner */}
        {activeAdvisory && activeAdvisory.description && !activeAdvisory.description.includes('Karnataka') ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: activeAdvisory.alert_color === 'RED' ? 'rgba(214, 69, 69, 0.16)' : 'rgba(217, 154, 22, 0.16)',
            border: `1px solid ${activeAdvisory.alert_color === 'RED' ? 'var(--risk-severe)' : 'var(--risk-watch)'}`,
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            maxWidth: '480px',
            fontSize: '0.75rem',
            color: '#FFFFFF'
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, color: activeAdvisory.alert_color === 'RED' ? '#FCA5A5' : '#FDE68A' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{activeAdvisory.issuing_agency || 'Official'} {activeAdvisory.alert_color} Advisory:</strong> {activeAdvisory.description}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            color: 'var(--text-inverse-muted)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <span className={`status-dot ${isBackendOnline ? 'status-dot-live' : 'status-dot-cached'}`}></span>
            <span>No verified Kerala advisory loaded</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
            <span>{dataFreshness === 'LIVE' ? 'ECMWF / Open-Meteo Synced' : 'Cached Feeds'}</span>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onOpenShelterModal && (
            <button
              onClick={onOpenShelterModal}
              id="btn-open-shelter-map"
              style={{
                backgroundColor: 'rgba(15, 157, 154, 0.2)',
                color: '#A7F3D0',
                border: '1px solid rgba(15, 157, 154, 0.4)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Open Kerala Relief Centers & Evacuation Safe-Spots Map"
            >
              <Compass size={13} color="#2DD4BF" />
              Relief Safe-Spots
            </button>
          )}

          {onOpenSosModal && (
            <button
              onClick={onOpenSosModal}
              id="btn-open-sos-workspace"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.2)',
                color: '#FCA5A5',
                border: '1px solid rgba(220, 38, 38, 0.45)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Open Unified Kerala SOS Distress Queue & Rescue Operations"
            >
              <LifeBuoy size={14} color="#EF4444" strokeWidth={2.4} />
              SOS Operations
              {activeSosCount > 0 && (
                <span style={{
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 6px',
                  fontSize: '0.65rem',
                  fontWeight: 800
                }}>
                  {activeSosCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onOpenComparisonModal}
            id="btn-model-comparison"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={13} color="var(--brand-cyan)" />
            Model Benchmarks
          </button>

          <button
            onClick={onOpenTestModal}
            id="btn-trigger-test-alert"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-inverse-muted)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Trigger an operator drill simulation test alert"
          >
            <BellRing size={13} />
            Drill Simulation
            {activeAlertCount > 0 && (
              <span style={{
                backgroundColor: 'var(--brand-teal)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-full)',
                padding: '1px 6px',
                fontSize: '0.65rem',
                fontWeight: 700
              }}>
                {activeAlertCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
