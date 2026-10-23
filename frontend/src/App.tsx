import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LocationSelector } from './components/LocationSelector';
import { RiskOverviewCards } from './components/RiskOverviewCards';
import { RainfallTrendChart } from './components/RainfallTrendChart';
import { FactorBreakdown } from './components/FactorBreakdown';
import { CoastalMap } from './components/CoastalMap';
import { AlertNotificationPanel } from './components/AlertNotificationPanel';
import { PredictionHistoryTable } from './components/PredictionHistoryTable';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { ModelComparisonModal } from './components/ModelComparisonModal';
import { Sliders, Bell, History } from 'lucide-react';
import { api } from './services/api';
import type { 
  LocationInfo, WeatherData, PredictionData, AlertItem, OfficialAdvisory 
} from './services/api';

export const App: React.FC = () => {
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [activeRegion, setActiveRegion] = useState<'kerala' | 'karnataka_archive'>('kerala');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('ernakulam');
  const [mechanismFilter, setMechanismFilter] = useState<string>('ALL');
  const [currentModelVersion, setCurrentModelVersion] = useState<string>('2.0.0');
  
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [advisories, setAdvisories] = useState<OfficialAdvisory[]>([]);
  const [comparisonData, setComparisonData] = useState<any>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'factors' | 'alerts' | 'history'>('factors');

  const loadLocationData = async (locId: string, modelVer: string, forceRefresh = false, simRainMm?: number) => {
    try {
      const [wData, pData, histData, alertData] = await Promise.all([
        api.getWeather(locId, forceRefresh),
        api.getPrediction(locId, modelVer, simRainMm),
        api.getPredictionHistory(locId),
        api.getAlerts()
      ]);
      setWeather(wData);
      setPrediction(pData);
      setHistory(histData);
      setAlerts(alertData);
    } catch (err: any) {
      console.error('Load location data error:', err);
      setError(err.message || 'Error updating weather and risk predictions.');
    }
  };

  // Load locations and initial data
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const [locs, advs, initialAlerts, comp, geo] = await Promise.all([
          api.getLocations('kerala'),
          api.getAdvisories(),
          api.getAlerts(),
          api.getModelComparison(),
          api.getKeralaGeography().catch(() => null)
        ]);

        // Merge bounds from geography endpoint if available
        let enrichedLocs = locs;
        if (geo && geo.districts) {
          enrichedLocs = locs.map(l => {
            const match = geo.districts.find(d => d.id === l.id);
            return match ? { ...l, bounds: match.bounds } : l;
          });
        }

        setLocations(enrichedLocs);
        setAdvisories(advs);
        setAlerts(initialAlerts);
        setComparisonData(comp);
        
        const initialLoc = enrichedLocs.find(l => l.id === 'ernakulam') ? 'ernakulam' : (enrichedLocs[0]?.id || 'ernakulam');
        setSelectedLocationId(initialLoc);
        await loadLocationData(initialLoc, '2.0.0');
      } catch (err: any) {
        console.error('Initialization error:', err);
        setError('Unable to connect to ResQNet backend. Please ensure the Python service is active on port 8000.');
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const handleRegionChange = async (region: 'kerala' | 'karnataka_archive') => {
    setActiveRegion(region);
    setIsRefreshing(true);
    try {
      const locs = await api.getLocations(region);
      let enrichedLocs = locs;
      if (region === 'kerala') {
        const geo = await api.getKeralaGeography().catch(() => null);
        if (geo && geo.districts) {
          enrichedLocs = locs.map(l => {
            const match = geo.districts.find(d => d.id === l.id);
            return match ? { ...l, bounds: match.bounds } : l;
          });
        }
      }
      setLocations(enrichedLocs);
      const defaultId = region === 'kerala' ? 'ernakulam' : (enrichedLocs[0]?.id || 'mangaluru_urban');
      setSelectedLocationId(defaultId);
      await loadLocationData(defaultId, currentModelVersion);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectLocation = async (id: string) => {
    setSelectedLocationId(id);
    setIsSimulating(false);
    setIsRefreshing(true);
    await loadLocationData(id, currentModelVersion);
    setIsRefreshing(false);
  };

  const handleToggleModelVersion = async (version: string) => {
    setCurrentModelVersion(version);
    setIsRefreshing(true);
    await loadLocationData(selectedLocationId, version);
    setIsRefreshing(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setIsSimulating(false);
    await loadLocationData(selectedLocationId, currentModelVersion, true);
    setIsRefreshing(false);
  };

  const handleSimulateRainfall = async (rainfallMm: number) => {
    setIsSimulating(true);
    setIsRefreshing(true);
    await loadLocationData(selectedLocationId, currentModelVersion, false, rainfallMm);
    setIsRefreshing(false);
  };

  const handleResetSimulation = async () => {
    setIsSimulating(false);
    setIsRefreshing(true);
    await loadLocationData(selectedLocationId, currentModelVersion, false);
    setIsRefreshing(false);
  };

  const handleSendTestAlert = async (locationId: string, severity: string) => {
    await api.triggerTestAlert(locationId, severity);
    const updatedAlerts = await api.getAlerts();
    setAlerts(updatedAlerts);
  };

  // Filter locations according to mechanism filter
  const filteredLocations = locations.filter(loc => {
    if (mechanismFilter === 'ALL') return true;
    if (mechanismFilter === 'COASTAL_COMPOUND') return loc.is_coastal;
    if (mechanismFilter === 'RIVERINE_OVERFLOW') return loc.basin && loc.basin.length > 0;
    if (mechanismFilter === 'URBAN_PLUVIAL') return loc.elevation_m < 50;
    return true;
  });

  const selectedLocation = locations.find(l => l.id === selectedLocationId) || locations[0] || null;

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-secondary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-light)',
          borderTopColor: 'var(--brand-teal)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '16px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
          Loading Kerala Flood Intelligence Telemetry...
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app)' }}>
      {/* Top Professional Emergency Navigation */}
      <Navbar 
        advisories={advisories}
        onOpenTestModal={() => setIsTestModalOpen(true)}
        onOpenComparisonModal={() => setIsComparisonModalOpen(true)}
        activeAlertCount={alerts.filter(a => a.severity === 'WARNING' || a.severity === 'EMERGENCY').length}
        dataFreshness={weather?.freshness || 'LIVE'}
        isBackendOnline={!error}
      />

      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px', flex: 1, width: '100%' }}>
        {/* Error notification if any */}
        {error && (
          <div style={{
            backgroundColor: 'var(--risk-severe-bg)',
            border: '1px solid var(--risk-severe-border)',
            color: 'var(--risk-severe)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '18px',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span><strong>Backend Connectivity Notice:</strong> {error}</span>
            <button 
              className="btn-secondary" 
              onClick={() => { setError(null); handleRefresh(); }}
              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Centralized Kerala District / Location Selector */}
        <LocationSelector
          locations={filteredLocations.length > 0 ? filteredLocations : locations}
          selectedId={selectedLocationId}
          onSelect={handleSelectLocation}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          freshness={weather?.freshness || 'LIVE'}
          cacheAge={weather?.cache_age_seconds || 0}
          mechanismFilter={mechanismFilter}
          onMechanismFilterChange={setMechanismFilter}
          activeRegion={activeRegion}
          onRegionChange={handleRegionChange}
        />

        {/* Primary 24-Hour Risk Summary & Key Hydrometeorological Indicators */}
        <RiskOverviewCards 
          prediction={prediction} 
          weather={weather}
          location={selectedLocation}
          currentModelVersion={currentModelVersion}
          onToggleModelVersion={handleToggleModelVersion}
        />

        {/* Main Analytics Area: 2-Column Responsive Layout (Map + Rainfall Timeline) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: '20px',
          marginBottom: '20px'
        }}>
          {/* Column 1: Kerala Geospatial Flood Intelligence Map */}
          <CoastalMap
            locations={filteredLocations.length > 0 ? filteredLocations : locations}
            selectedId={selectedLocationId}
            onSelect={handleSelectLocation}
            prediction={prediction}
            activeRegion={activeRegion}
          />

          {/* Column 2: Hydrometeorological Trend Timeline */}
          <RainfallTrendChart
            trend={weather?.hourly_trend || []}
            locationName={selectedLocation?.name || weather?.location_name || ''}
          />
        </div>

        {/* Secondary Detail Section: Organized Tabs */}
        <div className="dash-card" style={{ padding: '6px 12px 0 12px', marginBottom: '20px', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
            <button
              onClick={() => setActiveDetailTab('factors')}
              style={{
                backgroundColor: activeDetailTab === 'factors' ? 'var(--bg-surface-subtle)' : 'transparent',
                color: activeDetailTab === 'factors' ? 'var(--brand-teal)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeDetailTab === 'factors' ? '2px solid var(--brand-teal)' : '2px solid transparent',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sliders size={14} />
              Risk Factors & Simulation Sandbox
            </button>
            <button
              onClick={() => setActiveDetailTab('alerts')}
              style={{
                backgroundColor: activeDetailTab === 'alerts' ? 'var(--bg-surface-subtle)' : 'transparent',
                color: activeDetailTab === 'alerts' ? 'var(--brand-teal)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeDetailTab === 'alerts' ? '2px solid var(--brand-teal)' : '2px solid transparent',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Bell size={14} />
              In-App Notification Log ({alerts.length})
            </button>
            <button
              onClick={() => setActiveDetailTab('history')}
              style={{
                backgroundColor: activeDetailTab === 'history' ? 'var(--bg-surface-subtle)' : 'transparent',
                color: activeDetailTab === 'history' ? 'var(--brand-teal)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeDetailTab === 'history' ? '2px solid var(--brand-teal)' : '2px solid transparent',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <History size={14} />
              Prediction Inferences Audit ({history.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Contributing Factors & Stress Simulation Sandbox */}
        {activeDetailTab === 'factors' && prediction && (
          <FactorBreakdown
            factors={prediction.key_factors}
            onSimulateRainfall={handleSimulateRainfall}
            isSimulating={isSimulating}
            onResetSimulation={handleResetSimulation}
          />
        )}

        {/* Tab 2: Early Warning Audit Trail & Notification Log */}
        {activeDetailTab === 'alerts' && (
          <AlertNotificationPanel
            alerts={alerts}
            isTestModalOpen={isTestModalOpen}
            onCloseTestModal={() => setIsTestModalOpen(false)}
            onSendTestAlert={handleSendTestAlert}
            selectedLocationId={selectedLocationId}
          />
        )}

        {/* Tab 3: Historical Prediction Audit Logs */}
        {activeDetailTab === 'history' && (
          <PredictionHistoryTable history={history} />
        )}

        {/* Official Protocol Disclaimer */}
        <DisclaimerBanner />

        {/* Model Provenance & Benchmark Comparison Modal */}
        <ModelComparisonModal
          isOpen={isComparisonModalOpen}
          onClose={() => setIsComparisonModalOpen(false)}
          comparisonData={comparisonData}
        />
      </main>
    </div>
  );
};

export default App;
