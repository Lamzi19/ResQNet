import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X,
  Search,
  Radio,
  LifeBuoy,
  AlertTriangle,
  Compass,
  Navigation,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  ExternalLink,
  Anchor,
  MessageSquare,
  CheckCheck,
  Check,
  Maximize2,
  Plus,
  Minus
} from 'lucide-react';
import { api } from '../services/api';
import type {
  SosIncident,
  RescueBoat,
  SafetyBroadcast,
  IncidentMessage
} from '../services/api';
import {
  loadReliefFacilities,
  sortFacilitiesByProximity,
  type ReliefFacility
} from '../services/shelterService';
import { getGoogleMapsDirectionsUrl } from '../services/routingService';

interface SosOperationsWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  initialDistrictId?: string;
  initialSelectedIncidentId?: string | null;
}

const DISTRICTS_MAP: Record<string, string> = {
  all: 'All Operational Districts (Pan-Regional)',
  mangaluru_urban: 'Mangaluru (Dakshina Kannada)',
  alappuzha: 'Alappuzha',
  ernakulam: 'Ernakulam',
  idukki: 'Idukki',
  kannur: 'Kannur',
  kasaragod: 'Kasaragod',
  kollam: 'Kollam',
  kottayam: 'Kottayam',
  kozhikode: 'Kozhikode',
  malappuram: 'Malappuram',
  palakkad: 'Palakkad',
  pathanamthitta: 'Pathanamthitta',
  thiruvananthapuram: 'Thiruvananthapuram',
  thrissur: 'Thrissur',
  wayanad: 'Wayanad',
  unspecified: 'Location Unspecified (No GPS)',
  outside_kerala: 'Outside Kerala Coverage'
};

const DISTRICT_CENTERS: Record<string, [number, number]> = {
  ernakulam: [9.9816, 76.2999],
  alappuzha: [9.4981, 76.3388],
  thrissur: [10.5276, 76.2144],
  kottayam: [9.5916, 76.5222],
  wayanad: [11.6854, 76.132],
  idukki: [9.85, 76.97],
  thiruvananthapuram: [8.5241, 76.9366],
  kollam: [8.8932, 76.6141],
  pathanamthitta: [9.2648, 76.787],
  palakkad: [10.7867, 76.6548],
  malappuram: [11.0735, 76.074],
  kozhikode: [11.2588, 75.7804],
  kannur: [11.8745, 75.3704],
  kasaragod: [12.4996, 74.9869],
  mangaluru_urban: [12.9141, 74.8560]
};

function formatTimeAgo(isoString: string): string {
  try {
    const t = new Date(isoString).getTime();
    if (isNaN(t)) return 'Just now';
    const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  } catch {
    return 'Recently';
  }
}

function cleanLocationString(locationName?: string, districtName?: string): string {
  if (!locationName && !districtName) return 'Location Unspecified';
  const loc = (locationName || '').trim();
  const dist = (districtName || '').trim();
  if (!loc) return dist;
  if (!dist) return loc;
  if (loc.toLowerCase().includes(dist.toLowerCase())) {
    return loc;
  }
  return `${loc} (${dist})`;
}

function getMostRecentIncident(list: SosIncident[]): SosIncident | null {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

export const SosOperationsWorkspace: React.FC<SosOperationsWorkspaceProps> = ({
  isOpen,
  onClose,
  initialDistrictId = 'all',
  initialSelectedIncidentId = null
}) => {
  const [activeTab, setActiveTab] = useState<'incidents' | 'broadcast' | 'fleet'>('incidents');
  const [selectedDistrict, setSelectedDistrict] = useState<string>(initialDistrictId || 'all');

  // Incidents and Fleet Data
  const [incidents, setIncidents] = useState<SosIncident[]>([]);
  const [panRegionalIncidents, setPanRegionalIncidents] = useState<SosIncident[]>([]);
  const [boats, setBoats] = useState<RescueBoat[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<SosIncident | null>(null);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [isBackendLive, setIsBackendLive] = useState<boolean>(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Dedicated Most-Recent Incident Tracking & Selection Stability Refs
  const latestIncidentIdRef = useRef<string | null>(null);
  const isUserSelectedRef = useRef<boolean>(false);
  const prevIncidentIdsRef = useRef<Set<string>>(new Set());
  const appliedInitialIdRef = useRef<string | null>(null);

  // Two-Way Incident Messaging State
  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messageComposerText, setMessageComposerText] = useState<string>('');
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Map layer visibility
  const [showIncidentsLayer, setShowIncidentsLayer] = useState<boolean>(true);
  const [showVesselsLayer, setShowVesselsLayer] = useState<boolean>(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'priority' | 'recency' | 'waiting'>('priority');
  const [includeDemo, setIncludeDemo] = useState<boolean>(false);

  // Shelters for recommendations
  const [shelters, setShelters] = useState<ReliefFacility[]>([]);
  const [recommendedShelters, setRecommendedShelters] = useState<any[]>([]);

  // Safety Broadcasts Data
  const [broadcasts, setBroadcasts] = useState<SafetyBroadcast[]>([]);
  const [activeBroadcast, setActiveBroadcast] = useState<SafetyBroadcast | null>(null);
  const [broadcastCountdown, setBroadcastCountdown] = useState<number>(0);

  // Broadcast Composer
  const [composerTitle, setComposerTitle] = useState<string>('Mandatory Flood Safety Verification Check');
  const [composerMessage, setComposerMessage] = useState<string>('Periyar River overflow alert. Please report your safety status immediately.');
  const [composerDeadline, setComposerDeadline] = useState<number>(60);
  const [isComposing, setIsComposing] = useState<boolean>(false);

  // Responder Override Modal State
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [overrideLevel, setOverrideLevel] = useState<string>('CRITICAL');
  const [overrideScore, setOverrideScore] = useState<number>(95);
  const [overrideReason, setOverrideReason] = useState<string>('');

  // Map reference
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const vesselsLayerRef = useRef<L.LayerGroup | null>(null);

  // Load and poll incident messages when selected incident is active
  const loadIncidentMessages = useCallback(async (incId: string) => {
    try {
      const list = await api.getIncidentMessages(incId);
      setMessages(list);
      setMessageError(null);
    } catch (err: any) {
      console.warn('Failed to load incident messages:', err.message);
    }
  }, []);

  useEffect(() => {
    if (!selectedIncident) {
      setMessages([]);
      return;
    }
    setIsLoadingMessages(true);
    loadIncidentMessages(selectedIncident.id).finally(() => setIsLoadingMessages(false));

    const poll = setInterval(() => {
      loadIncidentMessages(selectedIncident.id);
    }, 4000);
    return () => clearInterval(poll);
  }, [selectedIncident?.id, loadIncidentMessages]);

  const handleSendIncidentReply = async (presetText?: string) => {
    const text = (presetText || messageComposerText).trim();
    if (!selectedIncident || !text) return;
    setIsSendingMessage(true);
    setMessageError(null);
    try {
      await api.sendIncidentMessage(
        selectedIncident.id,
        text,
        'responder',
        'ResQNet Incident Commander',
        selectedIncident.delivery_channel || 'INTERNET'
      );
      setMessageComposerText('');
      await loadIncidentMessages(selectedIncident.id);
    } catch (err: any) {
      setMessageError(err.message || 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // 1. Initial Load & Polling (Every 5 seconds)
  const refreshOperationsData = useCallback(async () => {
    try {
      const dist = selectedDistrict === 'all' ? undefined : selectedDistrict;
      const [incList, allIncList, boatList, bcList] = await Promise.all([
        api.getSosIncidents(dist, includeDemo),
        dist ? api.getSosIncidents(undefined, includeDemo).catch(() => []) : Promise.resolve([]),
        api.getRescueBoats(dist).catch(() => []),
        api.getSafetyBroadcasts(dist).catch(() => [])
      ]);

      setIncidents(incList);
      setPanRegionalIncidents(dist ? allIncList : incList);
      setBoats(boatList);
      setBroadcasts(bcList);
      if (bcList.length > 0) {
        const latest = bcList[0];
        setActiveBroadcast(latest);
        setBroadcastCountdown(latest.seconds_remaining || 0);
      }

      // Find the most recent SOS incident from backend by timestamp
      const latestInList = getMostRecentIncident(incList);

      // Determine if a genuinely NEW SOS incident was received
      const isGenuinelyNewSos = Boolean(
        latestInList && (
          !latestIncidentIdRef.current ||
          (latestInList.id !== latestIncidentIdRef.current && !prevIncidentIdsRef.current.has(latestInList.id))
        )
      );

      // Update our snapshot of known incident IDs
      prevIncidentIdsRef.current = new Set(incList.map(x => x.id));

      if (isGenuinelyNewSos && latestInList) {
        // Genuinely new SOS message received! Update this section dedicated to the newest SOS message
        latestIncidentIdRef.current = latestInList.id;
        isUserSelectedRef.current = false;
        setSelectedIncident(latestInList);
      } else {
        // NO new SOS received: do NOT fluctuate or swap to another incident!
        // Keep the currently displayed incident, updating its status/notes in-place.
        setSelectedIncident(prev => {
          if (!prev) {
            // Initial load default to most recent incident
            if (latestInList) {
              latestIncidentIdRef.current = latestInList.id;
              return latestInList;
            }
            return null;
          }
          // Update matching incident reference in-place without resetting focus
          const updated = incList.find(x => x.id === prev.id || x.message_id === prev.message_id);
          return updated || prev;
        });
      }

      setIsBackendLive(true);
      setNetworkError(null);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.warn('Operations sync error:', err.message);
      setIsBackendLive(false);
      setNetworkError(err.message || 'Central Gateway Offline');
    } finally {
      setIsLoadingIncidents(false);
    }
  }, [selectedDistrict, includeDemo]);

  useEffect(() => {
    if (!isOpen) {
      appliedInitialIdRef.current = null;
      return;
    }
    refreshOperationsData();
    const interval = setInterval(refreshOperationsData, 5000);
    return () => clearInterval(interval);
  }, [isOpen, refreshOperationsData]);

  // Synchronize initialSelectedIncidentId only once when explicitly requested from parent
  useEffect(() => {
    if (isOpen && initialSelectedIncidentId && initialSelectedIncidentId !== appliedInitialIdRef.current && incidents.length > 0) {
      const found = incidents.find(x => x.id === initialSelectedIncidentId || x.message_id === initialSelectedIncidentId);
      if (found) {
        appliedInitialIdRef.current = initialSelectedIncidentId;
        isUserSelectedRef.current = true;
        setSelectedIncident(found);
      }
    }
  }, [isOpen, initialSelectedIncidentId, incidents]);

  // Synchronize selectedDistrict when modal opens
  useEffect(() => {
    if (isOpen && initialDistrictId) {
      setSelectedDistrict(initialDistrictId);
    }
  }, [isOpen, initialDistrictId]);

  // Load shelters for intelligent recommendations
  useEffect(() => {
    if (!isOpen) return;
    loadReliefFacilities().then(res => setShelters(res.facilities || [])).catch(() => {});
  }, [isOpen]);

  // 2. Countdown timer for active broadcast
  useEffect(() => {
    if (broadcastCountdown <= 0) return;
    const t = setInterval(() => {
      setBroadcastCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [broadcastCountdown]);

  // 3. Leaflet Map Initialization & Real OpenStreetMap Tiles
  useEffect(() => {
    if (!isOpen || activeTab !== 'incidents' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCoords = DISTRICT_CENTERS[selectedDistrict] || [9.9816, 76.2999];
      const map = L.map(mapContainerRef.current, {
        center: initialCoords,
        zoom: 12,
        zoomControl: false, // Custom styled zoom controls
        attributionControl: true
      });

      // Permitted OpenStreetMap standard tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);

      const markers = L.layerGroup().addTo(map);
      const vessels = L.layerGroup().addTo(map);
      markersLayerRef.current = markers;
      vesselsLayerRef.current = vessels;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        vesselsLayerRef.current = null;
      }
    };
  }, [isOpen, activeTab]);

  // Update map pins when incidents, boats, layer toggles, or selected incident changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    const vLayer = vesselsLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (vLayer) vLayer.clearLayers();

    // Plot SOS incidents with valid GPS
    if (showIncidentsLayer) {
      incidents.forEach(inc => {
        if (inc.latitude == null || inc.longitude == null) return;

        const isSelected = selectedIncident?.id === inc.id;
        const isCritical = inc.priority_score >= 80 || inc.priority_level === 'CRITICAL';
        const color =
          inc.priority_score >= 80 ? '#EF4444' :
          inc.priority_score >= 60 ? '#F97316' :
          inc.priority_score >= 30 ? '#EAB308' : '#10B981';

        const markerClass = isSelected
          ? 'sos-marker-selected'
          : isCritical
          ? 'sos-marker-critical'
          : '';

        const iconHtml = `
          <div class="${markerClass}" style="
            background: radial-gradient(circle at 35% 35%, ${color}, #0f172a);
            width: ${isSelected ? '36px' : '26px'};
            height: ${isSelected ? '36px' : '26px'};
            border-radius: 50%;
            border: 2px solid ${isSelected ? '#38BDF8' : '#ffffff'};
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 800;
            font-size: ${isSelected ? '12px' : '10px'};
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            ${inc.priority_score}
          </div>
        `;

        const customIcon = L.divIcon({
          className: 'sos-custom-pin',
          html: iconHtml,
          iconSize: [isSelected ? 36 : 26, isSelected ? 36 : 26],
          iconAnchor: [isSelected ? 18 : 13, isSelected ? 18 : 13]
        });

        const marker = L.marker([inc.latitude, inc.longitude], {
          icon: customIcon,
          zIndexOffset: isSelected ? 1000 : inc.priority_score
        });

        marker.on('click', () => {
          isUserSelectedRef.current = true;
          setSelectedIncident(inc);
        });

        const accuracyHtml = inc.location_accuracy_m != null
          ? `<div style="color: #64748b; font-size: 11px;">Accuracy: ±${Math.round(inc.location_accuracy_m)}m</div>`
          : '';

        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 200px;">
            <div style="font-weight: 800; color: ${color}; font-size: 13px;">
              SOS #${inc.id} [${inc.priority_level} - ${inc.priority_score}/100]
            </div>
            <div style="font-weight: 600; color: #1e293b; margin-top: 2px;">
              ${inc.location_name || inc.district_name}
            </div>
            ${accuracyHtml}
            <div style="margin-top: 4px; color: #334155;">
              Stranded: <strong>${inc.people_count} person(s)</strong>
              ${inc.vulnerability_flags?.length ? ' • <span style="color: #d97706; font-weight: 700;">Vulnerable</span>' : ''}
            </div>
            <div style="margin-top: 4px; font-style: italic; color: #475569; border-left: 2px solid #cbd5e1; padding-left: 6px;">
              "${(inc.description || '').slice(0, 80)}..."
            </div>
            <div style="margin-top: 6px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
              <span>Status: <strong>${inc.response_status.toUpperCase()}</strong></span>
              <span>Channel: <strong>${inc.delivery_channel || 'Direct'}</strong></span>
            </div>
          </div>
        `);
        layer.addLayer(marker);
      });
    }

    // Plot rescue boats
    if (showVesselsLayer && vLayer) {
      boats.forEach(boat => {
        if (boat.latitude == null || boat.longitude == null) return;
        const bColor = boat.status === 'available' ? '#10B981' : boat.status === 'deployed' ? '#F59E0B' : '#6B7280';
        const boatIconHtml = `
          <div style="
            background-color: ${bColor};
            width: 24px;
            height: 24px;
            border-radius: 6px;
            border: 2px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            cursor: pointer;
          " title="${boat.name} (${boat.status})">
            🚤
          </div>
        `;
        const boatIcon = L.divIcon({
          className: 'boat-pin',
          html: boatIconHtml,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const bMarker = L.marker([boat.latitude, boat.longitude], { icon: boatIcon });
        bMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
            <strong style="color: #0284c7;">${boat.name}</strong><br/>
            <span>Agency: ${boat.agency}</span><br/>
            <span>Capacity: ${boat.capacity} persons · Crew: ${boat.crew_count}</span><br/>
            <span>Status: <strong>${boat.status.toUpperCase()}</strong></span>
          </div>
        `);
        vLayer.addLayer(bMarker);
      });
    }

    // Auto-focus on selected incident if it has valid location
    if (selectedIncident && selectedIncident.latitude != null && selectedIncident.longitude != null) {
      map.setView([selectedIncident.latitude, selectedIncident.longitude], 14, { animate: true });
    }
  }, [incidents, boats, selectedIncident, showIncidentsLayer, showVesselsLayer]);

  // Pan or fit map when selectedDistrict changes or initial load
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedDistrict !== 'all' && DISTRICT_CENTERS[selectedDistrict]) {
      map.setView(DISTRICT_CENTERS[selectedDistrict], 12, { animate: true });
    } else if (selectedDistrict === 'all') {
      const validPoints = incidents
        .filter(i => i.latitude != null && i.longitude != null)
        .map(i => [i.latitude!, i.longitude!] as [number, number]);
      if (validPoints.length > 1) {
        const bounds = L.latLngBounds(validPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      } else if (validPoints.length === 1) {
        map.setView(validPoints[0], 12, { animate: true });
      }
    }
  }, [selectedDistrict, incidents.length]);

  // Compute Shelter Recommendations when selected incident changes
  useEffect(() => {
    if (!selectedIncident || selectedIncident.latitude == null || selectedIncident.longitude == null || shelters.length === 0) {
      setRecommendedShelters([]);
      return;
    }

    const ranked = sortFacilitiesByProximity(selectedIncident.latitude, selectedIncident.longitude, shelters).slice(0, 3);
    setRecommendedShelters(ranked);
  }, [selectedIncident, shelters]);

  // Map interactive controls
  const handleFitAllIncidents = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const validPoints = incidents
      .filter(i => i.latitude != null && i.longitude != null)
      .map(i => [i.latitude!, i.longitude!] as [number, number]);
    if (validPoints.length > 1) {
      const bounds = L.latLngBounds(validPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (validPoints.length === 1) {
      map.setView(validPoints[0], 14, { animate: true });
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleFocusSelected = () => {
    if (selectedIncident && selectedIncident.latitude != null && selectedIncident.longitude != null) {
      mapInstanceRef.current?.setView([selectedIncident.latitude, selectedIncident.longitude], 15, { animate: true });
    }
  };

  // Filtered & Sorted Incidents
  const filteredIncidents = useMemo(() => {
    const PRIORITY_RANK: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MODERATE: 2,
      MEDIUM: 2,
      LOW: 1
    };

    return incidents.filter(inc => {
      // Search filter (id, message text, location name, participant id)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          inc.id.toLowerCase().includes(q) ||
          (inc.message_id || '').toLowerCase().includes(q) ||
          inc.description.toLowerCase().includes(q) ||
          inc.location_name.toLowerCase().includes(q) ||
          (inc.participant_id || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Priority filter
      if (priorityFilter !== 'ALL' && inc.priority_level !== priorityFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && inc.response_status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortOrder === 'priority') {
        // 1. Priority Category: Critical -> High -> Moderate -> Low
        const catA = PRIORITY_RANK[a.priority_level] || 0;
        const catB = PRIORITY_RANK[b.priority_level] || 0;
        if (catB !== catA) {
          return catB - catA;
        }
        // 2. Higher numeric priority score first within same category
        if (b.priority_score !== a.priority_score) {
          return b.priority_score - a.priority_score;
        }
        // 3. Older unresolved incidents first when scores are equal (FIFO)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortOrder === 'waiting') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [incidents, searchQuery, priorityFilter, statusFilter, sortOrder]);

  // Metrics KPI counters
  const totalCount = incidents.length;
  const criticalCount = incidents.filter(x => x.priority_level === 'CRITICAL').length;
  const unassignedCount = incidents.filter(x => x.response_status === 'unassigned').length;
  const relayCount = incidents.filter(x => x.delivery_channel?.includes('RELAY') || x.relay_node_id != null).length;
  const rescuedCount = incidents.filter(x => x.response_status === 'rescued' || x.response_status === 'closed').length;

  // Handlers for Responder Actions
  const handleStatusChange = async (incidentId: string, newStatus: string, boatId?: string) => {
    try {
      const boat = boats.find(b => b.id === boatId);
      await api.updateSosStatus(incidentId, {
        status: newStatus,
        assigned_boat_id: boat?.id || null,
        assigned_boat_name: boat?.name || null,
        mission_phase: newStatus === 'assigned' ? 'en_route' : newStatus === 'rescued' ? 'completed' : 'standby'
      });
      await refreshOperationsData();
    } catch (e: any) {
      alert(`Status update error: ${e.message}`);
    }
  };

  const handleAcknowledgeAsRescuer = async (incidentId: string) => {
    try {
      await api.acknowledgeSosByRescuer(incidentId, "ResQNet Tactical Commander", "Acknowledged from Command Center Console");
      await refreshOperationsData();
    } catch (e: any) {
      alert(`Rescuer acknowledgement failed: ${e.message}`);
    }
  };

  const handleApplyOverride = async () => {
    if (!selectedIncident) return;
    try {
      await api.updateSosStatus(selectedIncident.id, {
        status: selectedIncident.response_status,
        priority_override_level: overrideLevel,
        priority_override_score: overrideScore,
        priority_override_reason: overrideReason.trim() || 'Command Center Triage Override'
      });
      setOverrideModalOpen(false);
      setOverrideReason('');
      await refreshOperationsData();
    } catch (e: any) {
      alert(`Override error: ${e.message}`);
    }
  };

  const handleCreateBroadcast = async () => {
    if (!composerTitle.trim() || !composerMessage.trim()) return;
    setIsComposing(true);
    try {
      const bc = await api.createSafetyBroadcast({
        title: composerTitle,
        message: composerMessage,
        district_id: selectedDistrict === 'all' ? 'ernakulam' : selectedDistrict,
        deadline_seconds: composerDeadline
      });
      setActiveBroadcast(bc);
      setBroadcastCountdown(bc.seconds_remaining || composerDeadline);
      await refreshOperationsData();
      alert(`Broadcast "${bc.title}" dispatched to all ${bc.total_recipients} registered district participants!`);
    } catch (e: any) {
      alert(`Broadcast failed: ${e.message}`);
    } finally {
      setIsComposing(false);
    }
  };

  const handleEscalateParticipant = async (participantId: string) => {
    if (!activeBroadcast) return;
    try {
      const res = await api.escalateParticipant(activeBroadcast.id, participantId, 'Welfare escalation by Incident Commander');
      alert(`Participant ${participantId} escalated to official SOS Incident #${res.incident_id}!`);
      await refreshOperationsData();
    } catch (e: any) {
      alert(`Escalation failed: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(8, 14, 26, 0.96)',
      backdropFilter: 'blur(10px)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      color: '#F8FAFC',
      fontFamily: 'inherit'
    }}>
      {/* 1. Header Toolbar */}
      <div style={{
        padding: '12px 24px',
        backgroundColor: '#0F172A',
        borderBottom: '1px solid #1E293B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Brand & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 0 12px rgba(220, 38, 38, 0.5)'
          }}>
            <LifeBuoy size={22} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                ResQNet SOS Operations
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: isBackendLive ? '#34D399' : '#F87171',
                backgroundColor: isBackendLive ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                padding: '2px 8px',
                borderRadius: '999px',
                border: `1px solid ${isBackendLive ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isBackendLive ? '#10B981' : '#EF4444' }} />
                {isBackendLive ? 'LIVE BACKEND PERSISTED' : (networkError || 'BACKEND DISCONNECTED')}
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: 0 }}>
              Synchronized Citizen Android Distress Queue, BLE Mesh Ingestion & Safety Check Broadcasts
            </p>
          </div>
        </div>

        {/* Tab Switcher & District Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            backgroundColor: '#1E293B',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #334155'
          }}>
            <button
              onClick={() => setActiveTab('incidents')}
              style={{
                backgroundColor: activeTab === 'incidents' ? '#3B82F6' : 'transparent',
                color: activeTab === 'incidents' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Radio size={14} />
              Distress Queue ({totalCount})
            </button>
            <button
              onClick={() => setActiveTab('broadcast')}
              style={{
                backgroundColor: activeTab === 'broadcast' ? '#3B82F6' : 'transparent',
                color: activeTab === 'broadcast' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Send size={14} />
              Safety Broadcasts {broadcastCountdown > 0 ? `(${broadcastCountdown}s)` : ''}
            </button>
            <button
              onClick={() => setActiveTab('fleet')}
              style={{
                backgroundColor: activeTab === 'fleet' ? '#3B82F6' : 'transparent',
                color: activeTab === 'fleet' ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Anchor size={14} />
              Vessel Fleet ({boats.length})
            </button>
          </div>

          {/* District selector */}
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            style={{
              backgroundColor: '#1E293B',
              color: '#F8FAFC',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {Object.entries(DISTRICTS_MAP).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Refresh button */}
          <button
            onClick={refreshOperationsData}
            style={{
              backgroundColor: '#1E293B',
              color: '#94A3B8',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Refresh operations feed"
          >
            <RefreshCw size={14} className={isLoadingIncidents ? 'spin-animation' : ''} />
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              color: '#94A3B8',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              cursor: 'pointer',
              marginLeft: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Row */}
      <div style={{
        padding: '10px 24px',
        backgroundColor: '#0B1120',
        borderBottom: '1px solid #1E293B',
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        alignItems: 'center'
      }}>
        <div style={{
          backgroundColor: '#131D33',
          border: '1px solid #1E293B',
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Radio size={16} color="#60A5FA" />
          <div>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>
              {selectedDistrict === 'all' ? 'Total Ingested' : `Ingested (${DISTRICTS_MAP[selectedDistrict] || selectedDistrict})`}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>
              {totalCount}
              {selectedDistrict !== 'all' && panRegionalIncidents.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500, marginLeft: '6px' }}>
                  / {panRegionalIncidents.length} Pan-Regional
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#131D33',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={16} color="#EF4444" />
          <div>
            <div style={{ fontSize: '0.68rem', color: '#F87171', textTransform: 'uppercase', fontWeight: 600 }}>Critical Urgency</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#EF4444' }}>{criticalCount}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#131D33',
          border: '1px solid rgba(249, 115, 22, 0.3)',
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Clock size={16} color="#F97316" />
          <div>
            <div style={{ fontSize: '0.68rem', color: '#FB923C', textTransform: 'uppercase', fontWeight: 600 }}>Unassigned (Pending)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F97316' }}>{unassignedCount}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#131D33',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Navigation size={16} color="#06B6D4" />
          <div>
            <div style={{ fontSize: '0.68rem', color: '#22D3EE', textTransform: 'uppercase', fontWeight: 600 }}>Relayed via Peer Mesh</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#06B6D4' }}>{relayCount}</div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#131D33',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <CheckCircle2 size={16} color="#22C55E" />
          <div>
            <div style={{ fontSize: '0.68rem', color: '#4ADE80', textTransform: 'uppercase', fontWeight: 600 }}>Rescued / Secured</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22C55E' }}>{rescuedCount}</div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#64748B' }}>
          Last sync: <strong>{lastSyncTime}</strong> · Polling: <strong>5s</strong>
        </div>
      </div>

      {/* 3. Main Operational Workspaces */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* TAB 1: INCIDENT OPERATIONS & QUEUE */}
        {activeTab === 'incidents' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Column: Filterable Queue */}
            <div style={{
              width: '420px',
              borderRight: '1px solid #1E293B',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0F172A'
            }}>
              {/* Search & Filter Bar */}
              <div style={{ padding: '12px', borderBottom: '1px solid #1E293B', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#1E293B',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  gap: '8px',
                  border: '1px solid #334155'
                }}>
                  <Search size={14} color="#94A3B8" />
                  <input
                    type="text"
                    placeholder="Search ID, sender, message..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#F8FAFC',
                      fontSize: '0.78rem',
                      width: '100%'
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Priority filter pills */}
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
                  {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setPriorityFilter(lvl)}
                      style={{
                        backgroundColor: priorityFilter === lvl ? '#3B82F6' : '#1E293B',
                        color: priorityFilter === lvl ? '#FFFFFF' : '#94A3B8',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                {/* Status filter pills & sort */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['ALL', 'UNASSIGNED', 'ASSIGNED', 'RESCUED'].map(st => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        style={{
                          backgroundColor: statusFilter === st ? '#475569' : 'transparent',
                          color: statusFilter === st ? '#FFFFFF' : '#64748B',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => setIncludeDemo(prev => !prev)}
                      title="Toggle demo/test records vs real live phone distress beacons only"
                      style={{
                        backgroundColor: includeDemo ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                        color: includeDemo ? '#FACC15' : '#64748B',
                        border: `1px solid ${includeDemo ? '#EAB308' : '#334155'}`,
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {includeDemo ? '✓ Demo Mode (All)' : '+ Demo Records'}
                    </button>

                    <select
                      value={sortOrder}
                      onChange={(e: any) => setSortOrder(e.target.value)}
                      style={{
                        backgroundColor: '#1E293B',
                        color: '#94A3B8',
                        border: 'none',
                        fontSize: '0.65rem',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="priority">Sort: Priority</option>
                      <option value="waiting">Sort: Longest Waiting</option>
                      <option value="recency">Sort: Newest</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Incidents List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {selectedDistrict !== 'all' && panRegionalIncidents.length > incidents.length && (
                  <div style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    marginBottom: '8px',
                    fontSize: '0.72rem',
                    color: '#93C5FD',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                  }}>
                    <span>
                      Filtered to <strong>{DISTRICTS_MAP[selectedDistrict] || selectedDistrict}</strong> ({totalCount}).{' '}
                      <strong>{panRegionalIncidents.length - totalCount}</strong> other active distress incident(s) outside this district.
                    </span>
                    <button
                      onClick={() => setSelectedDistrict('all')}
                      style={{
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      View All
                    </button>
                  </div>
                )}

                {filteredIncidents.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>No matching distress signals found.</p>
                    <p style={{ fontSize: '0.72rem' }}>All distress beacons submitted from citizen handsets will appear here immediately.</p>
                  </div>
                ) : (
                  filteredIncidents.map(inc => {
                    const isSelected = selectedIncident?.id === inc.id;
                    const pColor =
                      inc.priority_level === 'CRITICAL' ? '#EF4444' :
                      inc.priority_level === 'HIGH' ? '#F97316' :
                      inc.priority_level === 'MEDIUM' ? '#EAB308' : '#22C55E';

                    return (
                      <div
                        key={inc.id}
                        onClick={() => {
                          isUserSelectedRef.current = true;
                          setSelectedIncident(inc);
                        }}
                        style={{
                          backgroundColor: isSelected ? '#1E293B' : '#131D33',
                          border: `1px solid ${isSelected ? '#3B82F6' : '#1E293B'}`,
                          borderRadius: '8px',
                          padding: '12px',
                          marginBottom: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              backgroundColor: pColor,
                              color: '#FFFFFF',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: 800
                            }}>
                              {inc.priority_score} · {inc.priority_level}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8' }}>
                              #{inc.id}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {inc.latitude == null && (
                              <span style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                color: '#EF4444',
                                fontSize: '0.6rem',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                NO GPS
                              </span>
                            )}
                            {inc.delivery_channel === 'BLUETOOTH_LE' && (
                              <span style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.25)',
                                color: '#60A5FA',
                                fontSize: '0.6rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                📡 OFFLINE BLE
                              </span>
                            )}
                            {inc.is_demo && (
                              <span style={{
                                backgroundColor: 'rgba(234, 179, 8, 0.2)',
                                color: '#FACC15',
                                fontSize: '0.6rem',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                DEMO
                              </span>
                            )}
                            {inc.delivery_channel?.includes('RELAY') && (
                              <span style={{
                                backgroundColor: 'rgba(6, 182, 212, 0.2)',
                                color: '#06B6D4',
                                fontSize: '0.6rem',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                RELAY (H:{inc.hop_count})
                              </span>
                            )}
                            {inc.delivery_status === 'ACKNOWLEDGED_BY_RESCUER' ? (
                              <span style={{
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#4ADE80',
                                fontSize: '0.6rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                ✓ RESCUER ACK
                              </span>
                            ) : (
                              <span style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                color: '#60A5FA',
                                fontSize: '0.6rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                ● SERVER RECEIVED
                              </span>
                            )}
                            <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                              {formatTimeAgo(inc.created_at)}
                            </span>
                          </div>
                        </div>

                        <p style={{
                          fontSize: '0.78rem',
                          color: '#F1F5F9',
                          margin: '0 0 6px 0',
                          lineHeight: 1.35,
                          fontWeight: 500,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {inc.description}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#94A3B8' }}>
                          <span>
                            📍 {inc.location_name} · 👥 <strong>{inc.people_count} stranded</strong>
                          </span>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: inc.response_status === 'rescued' ? 'rgba(34, 197, 94, 0.2)' : inc.response_status === 'assigned' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                            color: inc.response_status === 'rescued' ? '#4ADE80' : inc.response_status === 'assigned' ? '#60A5FA' : '#FB923C',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {inc.response_status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Middle Column: Interactive Geospatial Leaflet Map */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

              {/* Map Floating Controls: Fit Bounds, Zoom, Recenter */}
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}>
                <button
                  onClick={handleFitAllIncidents}
                  title="Fit Map to All Incident Coordinates"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#38BDF8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  onClick={handleZoomIn}
                  title="Zoom In"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#38BDF8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#38BDF8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                >
                  <Minus size={16} />
                </button>
                {selectedIncident && selectedIncident.latitude != null && (
                  <button
                    onClick={handleFocusSelected}
                    title="Pan to Selected Incident"
                    style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38BDF8',
                      padding: '6px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Navigation size={15} />
                  </button>
                )}
              </div>

              {/* Top-Right: Layer Visibility Controls */}
              <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 1000,
                display: 'flex',
                gap: '6px',
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}>
                <button
                  onClick={() => setShowIncidentsLayer(prev => !prev)}
                  style={{
                    backgroundColor: showIncidentsLayer ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                    color: showIncidentsLayer ? '#EF4444' : '#64748B',
                    border: `1px solid ${showIncidentsLayer ? '#EF4444' : 'transparent'}`,
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <AlertTriangle size={12} />
                  SOS Incidents ({incidents.filter(i => i.latitude != null).length})
                </button>

                <button
                  onClick={() => setShowVesselsLayer(prev => !prev)}
                  style={{
                    backgroundColor: showVesselsLayer ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                    color: showVesselsLayer ? '#06B6D4' : '#64748B',
                    border: `1px solid ${showVesselsLayer ? '#06B6D4' : 'transparent'}`,
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🚤 Rescue Fleet ({boats.filter(b => b.latitude != null).length})
                </button>
              </div>

              {/* Bottom-Right: Map Legend */}
              <div style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                zIndex: 1000,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                fontSize: '0.68rem',
                color: '#CBD5E1',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '2px' }}>
                  Map Triage Legend
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EF4444', display: 'inline-block' }} />
                  <span>Critical (80-100)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F97316', display: 'inline-block' }} />
                  <span>High (60-79)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EAB308', display: 'inline-block' }} />
                  <span>Moderate (30-59)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                  <span>Low (0-29)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#0284c7', display: 'inline-block' }} />
                  <span>Rescue Boat</span>
                </div>
              </div>

              {/* Map floating banner if selected incident has no GPS */}
              {selectedIncident && selectedIncident.latitude == null && (
                <div style={{
                  position: 'absolute',
                  top: '64px',
                  left: '16px',
                  right: '16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.95)',
                  color: '#FFFFFF',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  zIndex: 1000,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  fontSize: '0.78rem'
                }}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>LOCATION UNAVAILABLE for SOS #{selectedIncident.id}</strong>
                    <div>Citizen submitted distress without GPS lock or permission. Coordinate via citizen handset radio or phone contact.</div>
                  </div>
                </div>
              )}

              {/* Empty state notice if zero incidents have coordinates */}
              {incidents.filter(i => i.latitude != null && i.longitude != null).length === 0 && incidents.length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(15, 23, 42, 0.94)',
                  border: '1px solid #334155',
                  color: '#94A3B8',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  zIndex: 999,
                  fontSize: '0.75rem',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  pointerEvents: 'none',
                  textAlign: 'center',
                  maxWidth: '460px'
                }}>
                  📍 <strong>No Valid GPS Fixes in Current View:</strong> All active distress cases remain fully accessible and actionable in the left triage queue.
                </div>
              )}
            </div>

            {/* Right Column: Selected Incident Deep Dive & Operational Actions */}
            <div style={{
              width: '380px',
              borderLeft: '1px solid #1E293B',
              backgroundColor: '#0F172A',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '16px',
              gap: '16px'
            }}>
              {selectedIncident ? (
                <>
                  {/* Incident Header Card - Dedicated to Most Recent SOS with Full Situation & Location Details */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    {/* Status Ribbon: Most Recent vs Manual Selection */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {selectedIncident.id === latestIncidentIdRef.current ? (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                            color: '#38BDF8',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            <span className="status-dot status-dot-live" style={{ width: '6px', height: '6px' }} />
                            Most Recent Distress Beacon
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            backgroundColor: 'rgba(148, 163, 184, 0.12)',
                            color: '#94A3B8',
                            border: '1px solid #334155',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            textTransform: 'uppercase'
                          }}>
                            Selected Distress Record
                          </span>
                        )}
                      </div>

                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#64748B'
                      }}>
                        {formatTimeAgo(selectedIncident.created_at)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF' }}>
                          Incident #{selectedIncident.id}
                        </span>
                        {selectedIncident.message_id && (
                          <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontFamily: 'monospace' }}>
                            Beacon ID: {selectedIncident.message_id}
                          </span>
                        )}
                      </div>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        backgroundColor: selectedIncident.priority_level === 'CRITICAL' ? '#EF4444' : '#F97316',
                        color: 'white'
                      }}>
                        {selectedIncident.priority_score} · {selectedIncident.priority_level}
                      </span>
                    </div>

                    {/* Citizen Situation Box */}
                    <div style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(51, 65, 85, 0.5)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Citizen Distress Situation</span>
                        {selectedIncident.category && (
                          <span style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: '#F87171',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontSize: '0.6rem'
                          }}>
                            {selectedIncident.category.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.82rem', color: '#F1F5F9', lineHeight: 1.45, margin: 0, fontWeight: 500 }}>
                        "{selectedIncident.description}"
                      </p>
                    </div>

                    {/* Situation & Telemetry Key-Value Details */}
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div>
                        📍 <strong>Location:</strong>{' '}
                        <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
                          {cleanLocationString(selectedIncident.location_name, selectedIncident.district_name)}
                        </span>
                      </div>
                      <div>
                        🌐 <strong>Coordinates:</strong>{' '}
                        <span style={{ color: selectedIncident.latitude != null ? '#38BDF8' : '#EF4444', fontWeight: 600 }}>
                          {selectedIncident.latitude != null
                            ? `${selectedIncident.latitude.toFixed(4)}, ${selectedIncident.longitude?.toFixed(4)} (±${Math.round(selectedIncident.location_accuracy_m || 20)}m)`
                            : 'LOCATION UNAVAILABLE'}
                        </span>
                      </div>
                      <div>
                        👥 <strong>Stranded:</strong>{' '}
                        <strong style={{ color: '#F8FAFC' }}>{selectedIncident.people_count} person(s)</strong>
                        {' · '}
                        <span>Vulnerable: </span>
                        <strong style={{ color: selectedIncident.vulnerability_flags.length > 0 ? '#F59E0B' : '#94A3B8' }}>
                          {selectedIncident.vulnerability_flags.length > 0 ? 'YES' : 'None'}
                        </strong>
                      </div>
                      <div>
                        📡 <strong>Channel:</strong>{' '}
                        <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
                          {selectedIncident.delivery_channel || 'BLUETOOTH_LE'}
                          {selectedIncident.relay_node_id ? ` (Relay: ${selectedIncident.relay_node_id})` : ''}
                        </span>
                      </div>
                      <div>
                        📬 <strong>Delivery State:</strong>{' '}
                        {selectedIncident.delivery_status === 'ACKNOWLEDGED_BY_RESCUER' ? (
                          <span style={{ color: '#4ADE80', fontWeight: 700 }}>
                            RESCUER ACKNOWLEDGED ({selectedIncident.rescuer_name || 'Rescue Team'})
                          </span>
                        ) : (
                          <span style={{ color: '#60A5FA', fontWeight: 700 }}>
                            SERVER RECEIVED (Persisted)
                          </span>
                        )}
                      </div>
                      <div>
                        ⏰ <strong>Reported:</strong>{' '}
                        <span style={{ color: '#CBD5E1' }}>
                          {new Date(selectedIncident.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Priority Scoring Breakdown & Override */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase' }}>
                        Triage Rationale & Fairness Audit
                      </span>
                      <button
                        onClick={() => {
                          setOverrideScore(selectedIncident.priority_score);
                          setOverrideLevel(selectedIncident.priority_level);
                          setOverrideModalOpen(true);
                        }}
                        style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.2)',
                          color: '#60A5FA',
                          border: '1px solid #3B82F6',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Override Score
                      </button>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedIncident.priority_reasons.map((r, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <span style={{ color: '#38BDF8' }}>•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Responder Tasking & Boat Assignment */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#34D399', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                      Rescue Team Dispatch & Tasking
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '3px' }}>Assign Rescue Vessel</label>
                        <select
                          value={selectedIncident.assigned_boat_id || ''}
                          onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value ? 'assigned' : 'unassigned', e.target.value || undefined)}
                          style={{
                            width: '100%',
                            backgroundColor: '#1E293B',
                            color: '#F8FAFC',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            padding: '6px',
                            fontSize: '0.75rem'
                          }}
                        >
                          <option value="">-- No Vessel Assigned --</option>
                          {boats.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.agency}) - {b.status.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          onClick={() => handleStatusChange(selectedIncident.id, 'rescued')}
                          style={{
                            flex: 1,
                            backgroundColor: '#10B981',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Mark Rescued
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedIncident.id, 'unassigned')}
                          style={{
                            backgroundColor: '#334155',
                            color: '#94A3B8',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Reset
                        </button>
                      </div>

                      <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #1E293B' }}>
                        <button
                          onClick={() => handleAcknowledgeAsRescuer(selectedIncident.id)}
                          style={{
                            width: '100%',
                            backgroundColor: selectedIncident.delivery_status === 'ACKNOWLEDGED_BY_RESCUER' ? '#065F46' : '#2563EB',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <CheckCircle2 size={15} />
                          {selectedIncident.delivery_status === 'ACKNOWLEDGED_BY_RESCUER'
                            ? `✓ Rescuer Ack Sent (${selectedIncident.rescuer_name || 'Rescuer'})`
                            : 'Acknowledge as Rescuer (Send End-to-End Ack to Handset)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Two-Way Citizen-Responder Messaging Section */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MessageSquare size={16} color="#38BDF8" />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase' }}>
                          Two-Way Citizen Direct Dispatch
                        </span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                        {messages.length} message{messages.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Message Thread History */}
                    <div style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '8px',
                      backgroundColor: '#0F172A',
                      borderRadius: '6px',
                      border: '1px solid #1E293B',
                      marginBottom: '10px'
                    }}>
                      {isLoadingMessages && messages.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>
                          Connecting to incident message stream...
                        </div>
                      ) : messages.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>
                          No messages recorded yet. Send initial instructions to citizen.
                        </div>
                      ) : (
                        messages.map((m) => {
                          const isResponder = m.sender_role === 'responder';
                          const statusColor =
                            m.delivery_status === 'CONFIRMED_RECEIVED' ? '#10B981' :
                            m.delivery_status === 'SENT_TO_DEVICE' ? '#06B6D4' :
                            m.delivery_status === 'SAVED_ON_SERVER' ? '#F59E0B' :
                            m.delivery_status === 'DELIVERY_FAILED' ? '#EF4444' : '#94A3B8';

                          const statusLabel =
                            m.delivery_status === 'CONFIRMED_RECEIVED' ? '✓✓ Confirmed Received' :
                            m.delivery_status === 'SENT_TO_DEVICE' ? 'Sent to Handset' :
                            m.delivery_status === 'SAVED_ON_SERVER' ? 'Saved on Server' :
                            m.delivery_status === 'QUEUED_FOR_DELIVERY' ? 'Queued for Relay' :
                            m.delivery_status === 'DELIVERY_FAILED' ? '✗ Delivery Failed' : 'Unknown';

                          return (
                            <div
                              key={m.id}
                              style={{
                                alignSelf: isResponder ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                backgroundColor: isResponder ? 'rgba(37, 99, 235, 0.2)' : 'rgba(30, 41, 59, 0.8)',
                                border: `1px solid ${isResponder ? 'rgba(59, 130, 246, 0.4)' : '#334155'}`,
                                borderRadius: '8px',
                                padding: '8px 10px',
                                fontSize: '0.72rem',
                                color: '#F1F5F9'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                <span style={{
                                  fontWeight: 700,
                                  fontSize: '0.65rem',
                                  color: isResponder ? '#60A5FA' : '#4ADE80',
                                  textTransform: 'uppercase'
                                }}>
                                  {isResponder ? (m.sender_name || 'Incident Commander') : 'Citizen Distress'}
                                </span>
                                <span style={{ fontSize: '0.6rem', color: '#64748B' }}>
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              <p style={{ margin: 0, lineHeight: 1.35 }}>{m.message_text}</p>

                              {/* Honest delivery indicator */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.6rem', color: statusColor }}>
                                <span style={{ fontWeight: 600 }}>{statusLabel}</span>
                                {m.delivery_status === 'CONFIRMED_RECEIVED' && <CheckCheck size={12} />}
                                {m.delivery_status === 'SENT_TO_DEVICE' && <Check size={12} />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Quick Response Templates */}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600, marginBottom: '4px' }}>
                        Quick Responder Directives:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {[
                          "ResQNet: Your SOS has been received. A rescue team is being assigned. Please stay in a safe location if possible and keep your phone available.",
                          "Rescue boat is en route to your coordinates. Wave a bright cloth or shine a light to guide the crew.",
                          "Please confirm if water is currently entering the room or if medical assistance is required."
                        ].map((preset, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => setMessageComposerText(preset)}
                            style={{
                              textAlign: 'left',
                              backgroundColor: '#1E293B',
                              border: '1px solid #334155',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              color: '#93C5FD',
                              fontSize: '0.65rem',
                              cursor: 'pointer',
                              lineHeight: 1.25
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#60A5FA')}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#334155')}
                          >
                            "{preset.slice(0, 75)}..."
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message Composer */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <textarea
                        value={messageComposerText}
                        onChange={(e) => setMessageComposerText(e.target.value)}
                        placeholder="Type responder instructions to citizen..."
                        rows={2}
                        style={{
                          width: '100%',
                          backgroundColor: '#1E293B',
                          color: '#F8FAFC',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '8px',
                          fontSize: '0.72rem',
                          fontFamily: 'inherit',
                          resize: 'none',
                          outline: 'none'
                        }}
                      />

                      {messageError && (
                        <div style={{ color: '#EF4444', fontSize: '0.65rem', fontWeight: 600 }}>
                          {messageError}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.62rem', color: '#64748B' }}>
                          Channel: <strong>{selectedIncident.delivery_channel || 'INTERNET'}</strong>
                        </span>

                        <button
                          onClick={() => handleSendIncidentReply()}
                          disabled={isSendingMessage || !messageComposerText.trim()}
                          style={{
                            backgroundColor: isSendingMessage || !messageComposerText.trim() ? '#334155' : '#2563EB',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: isSendingMessage || !messageComposerText.trim() ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Send size={12} />
                          <span>{isSendingMessage ? 'Sending...' : 'Send to Citizen'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Integrated Safe-Spots Evacuation Recommendation */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Compass size={15} color="#2DD4BF" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2DD4BF', textTransform: 'uppercase' }}>
                        Nearest Evacuation Safe-Spots
                      </span>
                    </div>

                    {selectedIncident.latitude != null && (selectedIncident.latitude > 12.6 || (recommendedShelters[0]?.distance_km || 0) > 40) && (
                      <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', padding: '8px', marginBottom: '8px', fontSize: '0.72rem', color: '#FCD34D' }}>
                        ⚠️ <strong>Location outside Kerala SEOC Index:</strong> Incident coordinates are in Mangaluru / Coastal Karnataka. Nearest indexed relief facilities are in Kasaragod, Kerala (~{(recommendedShelters[0]?.distance_km || 0).toFixed(0)} km). Karnataka municipal shelter ingestion is pending.
                      </div>
                    )}

                    {recommendedShelters.length === 0 ? (
                      <p style={{ fontSize: '0.72rem', color: '#64748B', margin: 0 }}>
                        {selectedIncident.latitude == null ? 'Location unavailable for shelter routing.' : 'Calculating nearest verified camps...'}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recommendedShelters.map((sh: ReliefFacility, sIdx) => {
                          const freeBeds = sh.occupancy?.available_count ?? (sh.capacity_persons ? Math.round(sh.capacity_persons * 0.4) : 'Unverified');
                          return (
                            <div key={sIdx} style={{ backgroundColor: '#1E293B', borderRadius: '6px', padding: '8px', fontSize: '0.72rem' }}>
                              <div style={{ fontWeight: 700, color: '#F8FAFC' }}>{sh.name}</div>
                              <div style={{ color: '#94A3B8', marginTop: '2px' }}>
                                📍 {(sh.distance_km || 0).toFixed(1)} km away · Free: <strong>{freeBeds} beds</strong>
                              </div>
                              <a
                                href={getGoogleMapsDirectionsUrl(
                                  selectedIncident.latitude!,
                                  selectedIncident.longitude!,
                                  sh.latitude,
                                  sh.longitude
                                )}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: '#38BDF8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  marginTop: '4px',
                                  textDecoration: 'none',
                                  fontWeight: 600
                                }}
                              >
                                Open Navigation Route <ExternalLink size={10} />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748B' }}>
                  <Radio size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Select a distress beacon from the queue or map</p>
                  <p style={{ fontSize: '0.72rem' }}>Inspect citizen medical notes, priority audit reasons, nearby shelters, and assign rescue fleet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SCALABLE SAFETY BROADCASTS */}
        {activeTab === 'broadcast' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Column: Broadcast Composer & History */}
            <div style={{
              width: '380px',
              borderRight: '1px solid #1E293B',
              backgroundColor: '#0F172A',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflowY: 'auto'
            }}>
              {/* Broadcast Composer Card */}
              <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38BDF8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  New Safety-Check Broadcast
                </span>
                <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '0 0 12px 0' }}>
                  Dispatches an urgent welfare prompt to all registered citizen handsets with response tracking.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Broadcast Title</label>
                    <input
                      type="text"
                      value={composerTitle}
                      onChange={(e) => setComposerTitle(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#1E293B',
                        color: '#F8FAFC',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '0.75rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Directive Message</label>
                    <textarea
                      rows={3}
                      value={composerMessage}
                      onChange={(e) => setComposerMessage(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#1E293B',
                        color: '#F8FAFC',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        resize: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Response Deadline</label>
                    <select
                      value={composerDeadline}
                      onChange={(e) => setComposerDeadline(Number(e.target.value))}
                      style={{
                        width: '100%',
                        backgroundColor: '#1E293B',
                        color: '#F8FAFC',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '6px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value={30}>30 Seconds (Quick Hackathon Demo)</option>
                      <option value={60}>60 Seconds (Standard Protocol Check)</option>
                      <option value={300}>5 Minutes (Extended Community Drill)</option>
                      <option value={900}>15 Minutes (Civil Defense Survey)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleCreateBroadcast}
                    disabled={isComposing}
                    style={{
                      backgroundColor: '#3B82F6',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Send size={14} />
                    {isComposing ? 'Dispatching...' : 'Dispatch Broadcast'}
                  </button>
                </div>
              </div>

              {/* Past Broadcasts List */}
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Recent Broadcasts
                </span>
                {broadcasts.map(b => (
                  <div
                    key={b.id}
                    onClick={() => {
                      setActiveBroadcast(b);
                      setBroadcastCountdown(b.seconds_remaining || 0);
                    }}
                    style={{
                      backgroundColor: activeBroadcast?.id === b.id ? '#1E293B' : '#131D33',
                      border: `1px solid ${activeBroadcast?.id === b.id ? '#3B82F6' : '#1E293B'}`,
                      borderRadius: '6px',
                      padding: '10px',
                      marginBottom: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700 }}>
                      <span style={{ color: '#F8FAFC' }}>{b.title}</span>
                      <span style={{ color: b.is_expired ? '#64748B' : '#34D399' }}>{b.is_expired ? 'EXPIRED' : 'ACTIVE'}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>
                      👥 {b.total_recipients} Recipient(s) · ✅ {b.safe_count} Safe · 🚨 {b.help_count} Help
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Active Broadcast Live Tracking & Recipient Roster */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0B1120', overflowY: 'auto', padding: '20px', gap: '16px' }}>
              {activeBroadcast ? (
                <>
                  {/* Broadcast Banner with Live Countdown */}
                  <div style={{
                    backgroundColor: '#131D33',
                    border: '1px solid #1E293B',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>{activeBroadcast.title}</span>
                        <span style={{
                          backgroundColor: activeBroadcast.is_expired ? '#475569' : '#DC2626',
                          color: '#FFFFFF',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: 800
                        }}>
                          {activeBroadcast.is_expired ? 'DEADLINE EXPIRED' : 'ACTIVE CHECK-IN'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#CBD5E1', margin: 0 }}>"{activeBroadcast.message}"</p>
                    </div>

                    {/* Countdown Clock */}
                    <div style={{
                      backgroundColor: '#1E293B',
                      border: '2px solid #3B82F6',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Deadline Gauge</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: broadcastCountdown > 0 ? '#38BDF8' : '#64748B' }}>
                        {broadcastCountdown}s
                      </div>
                    </div>
                  </div>

                  {/* Aggregate Recipient Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div style={{ backgroundColor: '#131D33', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #1E293B' }}>
                      <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>TOTAL ROSTER</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>{activeBroadcast.total_recipients}</div>
                    </div>
                    <div style={{ backgroundColor: '#131D33', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                      <div style={{ fontSize: '0.65rem', color: '#4ADE80' }}>SAFE CONFIRMED</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22C55E' }}>{activeBroadcast.safe_count}</div>
                    </div>
                    <div style={{ backgroundColor: '#131D33', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <div style={{ fontSize: '0.65rem', color: '#F87171' }}>HELP REQUESTED</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#EF4444' }}>{activeBroadcast.help_count}</div>
                    </div>
                    <div style={{ backgroundColor: '#131D33', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                      <div style={{ fontSize: '0.65rem', color: '#FB923C' }}>AWAITING RESPONSE</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F97316' }}>{activeBroadcast.awaiting_count}</div>
                    </div>
                    <div style={{ backgroundColor: '#131D33', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                      <div style={{ fontSize: '0.65rem', color: '#C084FC' }}>NO RESPONSE (VERIFY)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#A855F7' }}>{activeBroadcast.unresponsive_count}</div>
                    </div>
                  </div>

                  {/* Recipient Roster Table */}
                  <div style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}>Recipient Welfare Telemetry</span>
                      <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Supports any number of registered participant handsets</span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#0F172A', color: '#94A3B8', borderBottom: '1px solid #1E293B' }}>
                          <th style={{ padding: '10px 14px' }}>Participant / ID</th>
                          <th style={{ padding: '10px 14px' }}>District</th>
                          <th style={{ padding: '10px 14px' }}>Delivery State</th>
                          <th style={{ padding: '10px 14px' }}>Safety Response</th>
                          <th style={{ padding: '10px 14px' }}>Location / Note</th>
                          <th style={{ padding: '10px 14px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBroadcast.recipients.map(r => {
                          const sColor =
                            r.safety_status === 'SAFE CONFIRMED' ? '#22C55E' :
                            r.safety_status === 'HELP REQUESTED' ? '#EF4444' :
                            r.safety_status === 'NO RESPONSE — VERIFY SAFETY' ? '#A855F7' : '#F97316';

                          return (
                            <tr key={r.participant_id} style={{ borderBottom: '1px solid #1E293B' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#F8FAFC' }}>{r.name}</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{r.participant_id}</div>
                              </td>
                              <td style={{ padding: '10px 14px', textTransform: 'capitalize' }}>
                                {r.district_id}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  backgroundColor: r.delivery_status === 'DELIVERED_TO_DEVICE' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: r.delivery_status === 'DELIVERED_TO_DEVICE' ? '#34D399' : '#94A3B8',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  fontWeight: 700
                                }}>
                                  {r.delivery_status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  backgroundColor: `${sColor}20`,
                                  color: sColor,
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.68rem',
                                  fontWeight: 800
                                }}>
                                  {r.safety_status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                                <div>{r.response_note || 'Awaiting handset submission.'}</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B' }}>
                                  {r.reported_latitude != null
                                    ? `GPS: ${r.reported_latitude.toFixed(4)}, ${r.reported_longitude?.toFixed(4)}`
                                    : r.last_known_latitude != null
                                    ? `Last Known: ${r.last_known_latitude.toFixed(4)}, ${r.last_known_longitude?.toFixed(4)}`
                                    : 'LOCATION UNAVAILABLE'}
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {r.is_escalated ? (
                                  <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '0.68rem' }}>
                                    SOS #{r.linked_sos_id}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleEscalateParticipant(r.participant_id)}
                                    style={{
                                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                      color: '#EF4444',
                                      border: '1px solid #EF4444',
                                      borderRadius: '4px',
                                      padding: '3px 8px',
                                      fontSize: '0.65rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Escalate to SOS
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                  <p>Select or create a safety broadcast to inspect live recipient check-in telemetry.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: RESCUE FLEET & BOATS */}
        {activeTab === 'fleet' && (
          <div style={{ flex: 1, backgroundColor: '#0B1120', padding: '20px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FFFFFF' }}>Kerala Rescue Fleet & Vessel Tasking</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94A3B8' }}>
                    Active staging bases, motorboats, inflatable rafts, and disaster response teams.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                {boats.map(boat => (
                  <div key={boat.id} style={{ backgroundColor: '#131D33', border: '1px solid #1E293B', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>{boat.name}</span>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{boat.agency} · Base: {boat.base_name || boat.district_name}</div>
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        backgroundColor: boat.status === 'available' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: boat.status === 'available' ? '#10B981' : '#F59E0B'
                      }}>
                        {boat.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                      <div>👨‍✈️ <strong>Commander:</strong> {boat.commander || 'Designated Officer'} ({boat.crew_count} crew)</div>
                      <div>👥 <strong>Max Capacity:</strong> {boat.capacity} survivors</div>
                      <div>⛽ <strong>Fuel:</strong> {boat.fuel_percent}% · Rescues Completed: {boat.rescues_completed}</div>
                      {boat.assigned_incident_id && (
                        <div style={{ color: '#F97316' }}>
                          🎯 <strong>Assigned Mission:</strong> Incident #{boat.assigned_incident_id} ({boat.mission_phase})
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={async () => {
                          await api.updateBoatStatus(boat.id, 'available', 'standby');
                          refreshOperationsData();
                        }}
                        style={{
                          flex: 1,
                          backgroundColor: '#1E293B',
                          color: '#34D399',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Set Available
                      </button>
                      <button
                        onClick={async () => {
                          await api.updateBoatStatus(boat.id, 'deployed', 'en_route');
                          refreshOperationsData();
                        }}
                        style={{
                          flex: 1,
                          backgroundColor: '#1E293B',
                          color: '#F59E0B',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Set Deployed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Responder Override Modal */}
      {overrideModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#131D33',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '20px',
            width: '380px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h4 style={{ margin: 0, color: '#FFFFFF' }}>Override Incident Priority</h4>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#94A3B8' }}>
              Override automated triage score with recorded command center justification.
            </p>

            <div>
              <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Override Level</label>
              <select
                value={overrideLevel}
                onChange={(e) => setOverrideLevel(e.target.value)}
                style={{ width: '100%', backgroundColor: '#1E293B', color: '#FFFFFF', border: '1px solid #334155', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}
              >
                <option value="CRITICAL">CRITICAL (Score 80-100)</option>
                <option value="HIGH">HIGH (Score 60-79)</option>
                <option value="MEDIUM">MEDIUM (Score 35-59)</option>
                <option value="LOW">LOW (Score 1-34)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Score (1-100)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={overrideScore}
                onChange={(e) => setOverrideScore(Number(e.target.value))}
                style={{ width: '100%', backgroundColor: '#1E293B', color: '#FFFFFF', border: '1px solid #334155', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'block', marginBottom: '2px' }}>Justification Reason</label>
              <textarea
                rows={2}
                placeholder="Reason for overriding algorithmic score..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                style={{ width: '100%', backgroundColor: '#1E293B', color: '#FFFFFF', border: '1px solid #334155', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                onClick={() => setOverrideModalOpen(false)}
                style={{ backgroundColor: 'transparent', color: '#94A3B8', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyOverride}
                style={{ backgroundColor: '#3B82F6', color: '#FFFFFF', border: 'none', borderRadius: '4px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SosOperationsWorkspace;
