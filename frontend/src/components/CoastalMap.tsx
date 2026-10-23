import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map, AlertCircle } from 'lucide-react';
import type { LocationInfo, PredictionData } from '../services/api';

interface CoastalMapProps {
  locations: LocationInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  prediction: PredictionData | null;
  activeRegion: 'kerala' | 'karnataka_archive';
}

export const CoastalMap: React.FC<CoastalMapProps> = ({
  locations,
  selectedId,
  onSelect,
  prediction,
  activeRegion
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<any | null>(null);
  const [geoJsonError, setGeoJsonError] = useState<boolean>(false);

  // Load verified Kerala 14 Administrative Districts GeoJSON
  useEffect(() => {
    let isMounted = true;
    fetch('/kerala_districts.geojson')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading GeoJSON`);
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setGeoJsonData(data);
          setGeoJsonError(false);
        }
      })
      .catch(err => {
        console.warn('Kerala district GeoJSON could not be loaded:', err);
        if (isMounted) {
          setGeoJsonError(true);
        }
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Initialize map centered on Kerala (or Coastal Karnataka if switched to archive)
      const centerLat = activeRegion === 'kerala' ? 10.35 : 12.96;
      const centerLng = activeRegion === 'kerala' ? 76.45 : 75.02;
      const initialZoom = activeRegion === 'kerala' ? 7.5 : 10;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: initialZoom,
        zoomControl: true,
        attributionControl: true
      });

      // Valid licensed OpenStreetMap tile provider with official copyright attribution
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    // Clear previous layers
    layerGroup.clearLayers();

    // Pan map to match selected location
    const currentLoc = locations.find(l => l.id === selectedId);
    if (currentLoc) {
      map.panTo([currentLoc.latitude, currentLoc.longitude], { animate: true });
    } else if (activeRegion === 'kerala') {
      map.setView([10.35, 76.45], 7.5);
    }

    // Determine semantic color for selected district based on flood risk
    let activeRiskColor = '#16845B'; // Low Risk Green
    if (prediction) {
      if (prediction.risk_level === 'HIGH_WARNING') activeRiskColor = '#D64545';
      else if (prediction.risk_level === 'MODERATE_ALERT') activeRiskColor = '#D99A16';
    }

    // 1. If in Kerala mode and GeoJSON is available, render accurate administrative polygons
    if (activeRegion === 'kerala' && geoJsonData) {
      try {
        const geoLayer = L.geoJSON(geoJsonData, {
          style: (feature) => {
            const districtName = feature?.properties?.DISTRICT || '';
            const matchingLoc = locations.find(
              l => l.name.toLowerCase() === districtName.toLowerCase() || 
                   l.id.toLowerCase() === districtName.toLowerCase()
            );
            const isSelected = matchingLoc ? matchingLoc.id === selectedId : false;

            return {
              color: isSelected ? 'var(--brand-teal, #0D9488)' : '#64748B',
              weight: isSelected ? 3 : 1.2,
              opacity: isSelected ? 1 : 0.6,
              fillColor: isSelected ? activeRiskColor : '#94A3B8',
              fillOpacity: isSelected ? 0.35 : 0.08,
              dashArray: isSelected ? undefined : '3, 4'
            };
          },
          onEachFeature: (feature, layer) => {
            const districtName = feature?.properties?.DISTRICT || '';
            const matchingLoc = locations.find(
              l => l.name.toLowerCase() === districtName.toLowerCase() || 
                   l.id.toLowerCase() === districtName.toLowerCase()
            );

            if (matchingLoc) {
              layer.bindPopup(`
                <div style="color: #172B4D; font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4; padding: 2px;">
                  <strong style="font-size: 13px;">${matchingLoc.name} District</strong>
                  ${matchingLoc.malayalam_name ? `<span style="color: #64748B;"> (${matchingLoc.malayalam_name})</span>` : ''}<br/>
                  <div style="margin-top: 4px; color: #475569;">
                    <span><strong>Basin:</strong> ${matchingLoc.basin}</span><br/>
                    <span><strong>Elevation:</strong> ${matchingLoc.elevation_m}m AMSL</span><br/>
                    <span><strong>Terrain:</strong> ${matchingLoc.terrain_type || (matchingLoc.is_coastal ? 'Coastal' : 'Inland')}</span><br/>
                    <span><strong>Coverage:</strong> ${matchingLoc.data_coverage_status || 'Full Multi-Factor'}</span>
                  </div>
                </div>
              `);

              layer.on('click', () => {
                onSelect(matchingLoc.id);
              });

              layer.on('mouseover', () => {
                const isSelected = matchingLoc.id === selectedId;
                (layer as L.Path).setStyle({
                  weight: isSelected ? 3.5 : 2.2,
                  fillOpacity: isSelected ? 0.45 : 0.18,
                  color: isSelected ? '#0D9488' : '#0F9D9A'
                });
              });

              layer.on('mouseout', () => {
                const isSelected = matchingLoc.id === selectedId;
                (layer as L.Path).setStyle({
                  weight: isSelected ? 3 : 1.2,
                  fillOpacity: isSelected ? 0.35 : 0.08,
                  color: isSelected ? '#0D9488' : '#64748B'
                });
              });
            }
          }
        });

        geoLayer.addTo(layerGroup);
      } catch (err) {
        console.error('Error rendering Kerala GeoJSON layer:', err);
      }
    }

    // 2. Render District Headquarters / Monitoring Station Markers
    locations.forEach(loc => {
      const isSelected = loc.id === selectedId;
      const markerColor = isSelected ? activeRiskColor : '#475569';

      const iconHtml = `
        <div style="
          width: ${isSelected ? '24px' : '16px'};
          height: ${isSelected ? '24px' : '16px'};
          border-radius: 50%;
          background: ${markerColor};
          border: 2px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(16, 27, 45, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
        ">
          <div style="width: ${isSelected ? '6px' : '4px'}; height: ${isSelected ? '6px' : '4px'}; border-radius: 50%; background: #FFFFFF;"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'kerala-district-marker',
        iconSize: [isSelected ? 24 : 16, isSelected ? 24 : 16],
        iconAnchor: [isSelected ? 12 : 8, isSelected ? 12 : 8]
      });

      const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(layerGroup);

      marker.bindPopup(`
        <div style="color: #172B4D; font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4; padding: 2px;">
          <strong style="font-size: 13px;">${loc.name}</strong>
          ${loc.malayalam_name ? `<span style="color: #64748B;"> (${loc.malayalam_name})</span>` : ''}<br/>
          <div style="margin-top: 4px; color: #475569;">
            <span><strong>Primary Basin:</strong> ${loc.basin}</span><br/>
            <span><strong>Elevation:</strong> ${loc.elevation_m}m AMSL</span><br/>
            <span><strong>Classification:</strong> ${loc.is_coastal ? 'Coastal Lagoon / Estuary' : 'Midland / Ghats Watershed'}</span>
          </div>
        </div>
      `);

      marker.on('click', () => onSelect(loc.id));
    });

  }, [locations, selectedId, prediction, activeRegion, geoJsonData, onSelect]);

  return (
    <div className="dash-card" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
            <Map size={16} color="var(--brand-teal)" />
            {activeRegion === 'kerala' ? 'Kerala 14 Districts Flood Geography' : 'Archived Karnataka Monitoring Stations'}
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            {activeRegion === 'kerala' 
              ? 'Survey of India administrative polygons & river basin corridors (click any district to inspect)'
              : 'Archived reference stations for model v1/v2 benchmark reproducibility'}
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--risk-low)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Low Risk</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--risk-watch)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Watch</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: 'var(--risk-severe)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Warning</span>
          </div>
        </div>
      </div>

      {/* Graceful Fallback Notice if GeoJSON unavailable */}
      {geoJsonError && activeRegion === 'kerala' && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(217, 154, 22, 0.08)',
          border: '1px solid var(--risk-watch-border)',
          borderRadius: 'var(--radius-xs)',
          marginBottom: '10px',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <AlertCircle size={14} color="var(--risk-watch)" />
          <span>Administrative boundary layer unavailable. District headquarters station markers active.</span>
        </div>
      )}

      <div 
        ref={mapContainerRef} 
        style={{ 
          width: '100%', 
          height: '420px', 
          borderRadius: 'var(--radius-sm)', 
          border: '1px solid var(--border-light)',
          overflow: 'hidden'
        }} 
      />
    </div>
  );
};

