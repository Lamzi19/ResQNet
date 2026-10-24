import React, { useState, useEffect, useRef } from 'react';
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
import { ShelterFinderModal } from './components/ShelterFinderModal';
import { SosOperationsWorkspace } from './components/SosOperationsWorkspace';
import { SosEmergencyAlertModal } from './components/SosEmergencyAlertModal';
import { Sliders, Bell, History, Compass, LifeBuoy, ArrowRight } from 'lucide-react';
import { api } from './services/api';
import type {
  LocationInfo, WeatherData, PredictionData, AlertItem, OfficialAdvisory, SosIncident
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
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState<boolean>(false);
  const [isShelterModalOpen, setIsShelterModalOpen] = useState<boolean>(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [sosIncidents, setSosIncidents] = useState<SosIncident[]>([]);
  const [sosAlertQueue, setSosAlertQueue] = useState<SosIncident[]>([]);
  const [selectedSosIncidentForWorkspace, setSelectedSosIncidentForWorkspace] = useState<string | null>(null);

  const seenSosIdsRef = useRef<Set<string>>(new Set());
  const isInitialSosLoadRef = useRef<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'factors' | 'alerts' | 'history'>('factors');

  const loadLocationData = async (
    locId: string,
    modelVer: string,
    forceRefresh = false,
    simRainMm?: number,
    scenarioName?: string | null
  ) => {
    try {
      const [wData, pData, histData, alertData] = await Promise.all([
        api.getWeather(locId, forceRefresh),
        api.getPrediction(locId, modelVer, simRainMm, scenarioName || undefined),
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

  const loadSosIncidents = async () => {
    try {
      const data = await api.getSosIncidents();
      setSosIncidents(data);

      if (isInitialSosLoadRef.current) {
        // First load on application mount: populate seen IDs without triggering popup barrage
        data.forEach(inc => seenSosIdsRef.current.add(inc.id));
        isInitialSosLoadRef.current = false;
      } else {
        // Detect genuinely new arriving SOS incidents
        const newIncidents = data.filter(inc => !seenSosIdsRef.current.has(inc.id) && !inc.is_demo);
        if (newIncidents.length > 0) {
          // Sort Critical priority first (descending rule-based priority score)
          newIncidents.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
          // Mark all new incidents as seen to avoid repeated triggering on subsequent polls
          newIncidents.forEach(inc => seenSosIdsRef.current.add(inc.id));
          // Append to notification queue
          setSosAlertQueue(prev => [...prev, ...newIncidents]);
        }
      }
    } catch (e) {
      console.warn('Could not poll SOS incidents:', e);
    }
  };

  const handleViewSosIncident = (incident: SosIncident) => {
    // Dismiss current alert from queue
    setSosAlertQueue(prev => prev.filter(x => x.id !== incident.id));
    // Select this incident in the workspace and launch modal
    setSelectedSosIncidentForWorkspace(incident.id);
    setIsSosModalOpen(true);
  };

  const handleAcknowledgeSosAlert = async (incident: SosIncident) => {
    try {
      await api.acknowledgeSosByRescuer(incident.id, 'ResQNet Incident Commander');
    } catch (err) {
      console.warn('Failed to acknowledge SOS from alert modal:', err);
    }
    // Remove from alert queue
    setSosAlertQueue(prev => prev.filter(x => x.id !== incident.id));
    loadSosIncidents();
  };

  const handleDismissSosAlert = () => {
    // Pop current alert from queue
    setSosAlertQueue(prev => prev.slice(1));
  };

  useEffect(() => {
    loadSosIncidents();
    const interval = setInterval(loadSosIncidents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setIsSimulating(false);
    setActiveScenario(null);
    await Promise.all([
      loadLocationData(selectedLocationId, currentModelVersion, true),
      loadSosIncidents()
    ]);
    setIsRefreshing(false);
  };

  const handleSelectScenario = async (scenario: string) => {
    setActiveScenario(scenario);
    setIsSimulating(true);
    setIsRefreshing(true);
    await loadLocationData(selectedLocationId, currentModelVersion, false, undefined, scenario);
    setIsRefreshing(false);
  };

  const handleSimulateRainfall = async (rainfallMm: number) => {
    setActiveScenario(null);
    setIsSimulating(true);
    setIsRefreshing(true);
    await loadLocationData(selectedLocationId, currentModelVersion, false, rainfallMm);
    setIsRefreshing(false);
  };

  const handleResetSimulation = async () => {
    setActiveScenario(null);
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

  // Active SOS statistics
  const activeSosList = sosIncidents.filter(s => s.response_status !== 'resolved' && s.response_status !== 'cancelled');
  const criticalSosCount = activeSosList.filter(s => s.priority_level === 'CRITICAL' || s.priority_score >= 80).length;
  const pendingDispatchCount = activeSosList.filter(s => s.response_status === 'unassigned').length;
  const totalStrandedPeople = activeSosList.reduce((acc, curr) => acc + (curr.people_count || 1), 0);
  const latestIncident = activeSosList.length > 0 ? activeSosList[0] : null;

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
        onOpenShelterModal={() => setIsShelterModalOpen(true)}
        onOpenSosModal={() => setIsSosModalOpen(true)}
        activeAlertCount={alerts.filter(a => a.severity === 'WARNING' || a.severity === 'EMERGENCY').length}
        activeSosCount={pendingDispatchCount}
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

        {/* SOS Inbox / Rescue Requests Live Operations Card */}
        <div
          id="sos-inbox-summary-card"
          className="dash-card"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: activeSosList.length > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-light)',
            borderLeft: '4px solid #ef4444',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          {/* Left section: Identity, Status & Counts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <LifeBuoy size={24} strokeWidth={2.4} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  SOS Inbox & Citizen Distress Requests
                </h3>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  backgroundColor: !error ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                  color: !error ? '#10b981' : '#ef4444',
                  border: `1px solid ${!error ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span className={`status-dot ${!error ? 'status-dot-live' : 'status-dot-cached'}`} />
                  {!error ? 'LIVE BACKEND SYNC' : 'BACKEND OFFLINE'}
                </span>
                {activeSosList.length > 0 && (
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {activeSosList.length} Active Distress Cases
                  </span>
                )}
              </div>

              {/* Quick Metrics */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>
                  Critical Priority: <strong style={{ color: criticalSosCount > 0 ? '#ef4444' : 'inherit' }}>{criticalSosCount}</strong>
                </span>
                <span>•</span>
                <span>
                  Pending Dispatch: <strong style={{ color: pendingDispatchCount > 0 ? '#f59e0b' : 'inherit' }}>{pendingDispatchCount}</strong>
                </span>
                <span>•</span>
                <span>
                  Stranded Citizens: <strong>{totalStrandedPeople}</strong>
                </span>
                {latestIncident && (
                  <>
                    <span>•</span>
                    <span style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Latest: <em style={{ color: 'var(--text-primary)' }}>"{latestIncident.description || 'Distress signal'}" ({latestIncident.district_name || latestIncident.district_id || 'Kerala'})</em>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right section: Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setIsShelterModalOpen(true)}
              className="btn-secondary"
              style={{
                fontSize: '0.78rem',
                padding: '8px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Compass size={14} />
              Safe-Spots Shelters
            </button>

            <button
              id="btn-launch-sos-workspace"
              onClick={() => setIsSosModalOpen(true)}
              style={{
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
              }}
            >
              <LifeBuoy size={15} />
              Open SOS Operations Workspace
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

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
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setIsShelterModalOpen(true)}
                id="tab-btn-open-shelters"
                style={{
                  backgroundColor: 'rgba(15, 157, 154, 0.08)',
                  color: 'var(--brand-teal)',
                  border: '1px dashed var(--brand-teal)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Open verified Kerala relief centers and evacuation map"
              >
                <Compass size={13} />
                Find Nearest Safe-Spots
              </button>

              <button
                onClick={() => setIsSosModalOpen(true)}
                id="tab-btn-open-sos"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Open Unified Kerala SOS Distress Queue & Operations"
              >
                <LifeBuoy size={13} />
                SOS Operations ({pendingDispatchCount})
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: Contributing Factors & Stress Simulation Sandbox */}
        {activeDetailTab === 'factors' && prediction && (
          <FactorBreakdown
            factors={prediction.key_factors}
            onSimulateRainfall={handleSimulateRainfall}
            isSimulating={isSimulating}
            activeScenario={activeScenario}
            onSelectScenario={handleSelectScenario}
            onResetSimulation={handleResetSimulation}
            prediction={prediction}
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

        {/* Kerala Relief Centers & Evacuation Map Modal */}
        <ShelterFinderModal
          isOpen={isShelterModalOpen}
          onClose={() => setIsShelterModalOpen(false)}
          initialDistrictId={selectedLocationId}
        />

        {/* Emergency SOS Arrival Overlay Modal */}
        <SosEmergencyAlertModal
          incident={sosAlertQueue[0] || null}
          queueCount={sosAlertQueue.length}
          onViewIncident={handleViewSosIncident}
          onAcknowledge={handleAcknowledgeSosAlert}
          onDismiss={handleDismissSosAlert}
        />

        {/* Unified SOS Operations, Rescue Queue & Safety Check Workspace */}
        <SosOperationsWorkspace
          isOpen={isSosModalOpen}
          onClose={() => {
            setIsSosModalOpen(false);
            setSelectedSosIncidentForWorkspace(null);
            loadSosIncidents();
          }}
          initialDistrictId="all"
          initialSelectedIncidentId={selectedSosIncidentForWorkspace}
        />
      </main>
    </div>
  );
};

export default App;
