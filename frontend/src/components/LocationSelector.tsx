import React from 'react';
import { MapPin, Mountain, Waves, RefreshCw, Filter, Layers, Info } from 'lucide-react';
import type { LocationInfo } from '../services/api';

interface LocationSelectorProps {
  locations: LocationInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  freshness: string;
  cacheAge: number;
  mechanismFilter: string;
  onMechanismFilterChange: (filter: string) => void;
  activeRegion: 'kerala' | 'karnataka_archive';
  onRegionChange: (region: 'kerala' | 'karnataka_archive') => void;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  locations,
  selectedId,
  onSelect,
  onRefresh,
  isRefreshing,
  freshness,
  cacheAge,
  mechanismFilter,
  onMechanismFilterChange,
  activeRegion,
  onRegionChange
}) => {
  const selected = locations.find(l => l.id === selectedId) || locations[0];

  const getCoverageBadge = (status?: string) => {
    switch (status) {
      case 'FULL_MULTI_FACTOR':
        return <span className="badge badge-teal"><Layers size={11} /> Multi-Factor Instrumentation</span>;
      case 'RIVERINE_AND_WEATHER':
        return <span className="badge badge-neutral"><Waves size={11} /> River Gauge & Weather</span>;
      default:
        return <span className="badge badge-neutral"><Info size={11} /> Weather & Soil Only</span>;
    }
  };

  const getTerrainBadge = (type?: string) => {
    switch (type) {
      case 'HIGHLAND_GHATS':
        return <span className="badge badge-neutral"><Mountain size={11} /> Highland Ghats (Steep Runoff)</span>;
      case 'COASTAL':
        return <span className="badge badge-neutral"><Waves size={11} /> Coastal Lowland / Estuary</span>;
      case 'LOWLAND_KUTTANAD':
        return <span className="badge badge-watch"><Waves size={11} /> Below Sea Level (Kuttanad)</span>;
      default:
        return <span className="badge badge-neutral">Midland Valley Catchment</span>;
    }
  };

  return (
    <div className="dash-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
      {/* Top Header Row: Region switcher and Filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
        paddingBottom: '14px',
        borderBottom: '1px solid var(--border-light)'
      }}>
        {/* Region Scope Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Territory Scope:
          </span>
          <div style={{
            display: 'inline-flex',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
            border: '1px solid var(--border-light)'
          }}>
            <button
              onClick={() => onRegionChange('kerala')}
              style={{
                backgroundColor: activeRegion === 'kerala' ? 'var(--brand-teal)' : 'transparent',
                color: activeRegion === 'kerala' ? '#FFFFFF' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '0.78rem',
                fontWeight: activeRegion === 'kerala' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              Kerala (14 Districts)
            </button>
            <button
              onClick={() => onRegionChange('karnataka_archive')}
              style={{
                backgroundColor: activeRegion === 'karnataka_archive' ? 'var(--text-secondary)' : 'transparent',
                color: activeRegion === 'karnataka_archive' ? '#FFFFFF' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '0.78rem',
                fontWeight: activeRegion === 'karnataka_archive' ? 700 : 500,
                cursor: 'pointer'
              }}
              title="Access preserved coastal Karnataka stations for model benchmark verification"
            >
              Archived Karnataka Benchmarks
            </button>
          </div>
        </div>

        {/* Flood Mechanism Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Mechanism:</span>
          <select
            value={mechanismFilter}
            onChange={(e) => onMechanismFilterChange(e.target.value)}
            style={{
              fontSize: '0.78rem',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Flood Mechanisms</option>
            <option value="RIVERINE_OVERFLOW">Riverine Overflow</option>
            <option value="URBAN_PLUVIAL">Urban Pluvial (Waterlogging)</option>
            <option value="COASTAL_COMPOUND">Coastal Estuarine Surge</option>
          </select>

          {/* Sync Telemetry */}
          <button
            className="btn-secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{ padding: '4px 10px', fontSize: '0.75rem', marginLeft: '6px' }}
          >
            <RefreshCw size={12} className={isRefreshing ? 'spin-anim' : ''} />
            {isRefreshing ? 'Syncing...' : 'Sync Data'}
          </button>
        </div>
      </div>

      {/* District / Station Selector Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '14px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} color="var(--brand-teal)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {selected?.name}
              {selected?.malayalam_name && (
                <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '8px' }}>
                  ({selected.malayalam_name})
                </span>
              )}
            </h2>
            {selected && getCoverageBadge(selected.data_coverage_status)}
            {selected && getTerrainBadge(selected.terrain_type)}
          </div>
        </div>

        {/* Freshness & Timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span className={`status-dot ${freshness === 'LIVE' ? 'status-dot-live' : 'status-dot-cached'}`}></span>
          <span>{freshness === 'LIVE' ? 'Live IMD/ECMWF Telemetry' : `Cached (${cacheAge}s)`}</span>
        </div>
      </div>

      {/* Horizontal District Pills */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        marginBottom: '14px'
      }}>
        {locations.map(loc => {
          const isCurrent = loc.id === selectedId;
          return (
            <button
              key={loc.id}
              onClick={() => onSelect(loc.id)}
              style={{
                backgroundColor: isCurrent ? 'var(--brand-teal)' : 'var(--bg-surface-subtle)',
                color: isCurrent ? '#FFFFFF' : 'var(--text-secondary)',
                border: isCurrent ? '1px solid var(--brand-teal)' : '1px solid var(--border-light)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                fontWeight: isCurrent ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {loc.name.split(' (')[0]}
            </button>
          );
        })}
      </div>

      {/* Selected Location Context Attributes */}
      {selected && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-light)',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)'
        }}>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Primary Catchment / Basin:</strong> {selected.basin}
          </div>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Average Elevation:</strong> {selected.elevation_m}m AMSL
          </div>
          <div style={{ gridColumn: 'span 2', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <em>{selected.vulnerability_notes}</em>
          </div>
        </div>
      )}
    </div>
  );
};
