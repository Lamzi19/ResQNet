import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  X,
  Search,
  Crosshair,
  Compass,
  AlertTriangle,
  Building,
  Users,
  Database,
  PhoneCall,
  Info,
  Route,
  Navigation2,
  Clock,
  ExternalLink,
  Milestone,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Loader2,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Check
} from 'lucide-react';
import type {
  ReliefFacility,
  UserGeoLocation,
  ReservationResponse,
  ShelterRecommendationResponse
} from '../services/shelterService';
import {
  requestUserLocation,
  loadReliefFacilities,
  sortFacilitiesByProximity,
  reserveShelterSpace,
  checkInReservation,
  cancelReservation,
  staffUpdateCapacity,
  getShelterRecommendation,
  getLocalReservation,
  clearLocalReservation
} from '../services/shelterService';
import type { RouteResult } from '../services/routingService';
import {
  fetchRoadRoute,
  getGoogleMapsDirectionsUrl
} from '../services/routingService';

interface ShelterFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDistrictId?: string;
}

const KERALA_DISTRICTS_LIST = [
  { id: 'all', name: 'All 14 Kerala Districts' },
  { id: 'alappuzha', name: 'Alappuzha (ആലപ്പുഴ)' },
  { id: 'ernakulam', name: 'Ernakulam (എറണാകുളം)' },
  { id: 'idukki', name: 'Idukki (ഇടുക്കി)' },
  { id: 'kannur', name: 'Kannur (കണ്ണൂർ)' },
  { id: 'kasaragod', name: 'Kasaragod (കാസർഗോഡ്)' },
  { id: 'kollam', name: 'Kollam (കൊല്ലം)' },
  { id: 'kottayam', name: 'Kottayam (കോട്ടയം)' },
  { id: 'kozhikode', name: 'Kozhikode (കോഴിക്കോട്)' },
  { id: 'malappuram', name: 'Malappuram (മലപ്പുറം)' },
  { id: 'palakkad', name: 'Palakkad (പാലക്കാട്)' },
  { id: 'pathanamthitta', name: 'Pathanamthitta (പത്തനംതിട്ട)' },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram (തിരുവനന്തപുരം)' },
  { id: 'thrissur', name: 'Thrissur (തൃശ്ശൂർ)' },
  { id: 'wayanad', name: 'Wayanad (വയനാട്)' }
];

// District centroids for initial map positioning & non-navigation reference
const DISTRICT_CENTROIDS: Record<string, [number, number]> = {
  thiruvananthapuram: [8.5241, 76.9366],
  kollam: [8.8932, 76.6141],
  pathanamthitta: [9.2648, 76.787],
  alappuzha: [9.4981, 76.3388],
  kottayam: [9.5916, 76.5222],
  idukki: [9.85, 76.97],
  ernakulam: [9.9816, 76.2999],
  thrissur: [10.5276, 76.2144],
  palakkad: [10.7867, 76.6548],
  malappuram: [11.0735, 76.074],
  kozhikode: [11.2588, 75.7804],
  wayanad: [11.6854, 76.132],
  kannur: [11.8745, 75.3704],
  kasaragod: [12.4996, 74.9869]
};

export const ShelterFinderModal: React.FC<ShelterFinderModalProps> = ({
  isOpen,
  onClose,
  initialDistrictId = 'ernakulam'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markerLookupRef = useRef<Map<string, L.Marker>>(new Map());

  // Dataset & Filter States
  const [facilities, setFacilities] = useState<ReliefFacility[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>(initialDistrictId || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [sourceDate, setSourceDate] = useState<string>('2020-08-05');
  const [selectedFacility, setSelectedFacility] = useState<ReliefFacility | null>(null);

  // GPS User Location State
  const [userLocation, setUserLocation] = useState<UserGeoLocation>({
    lat: DISTRICT_CENTROIDS[initialDistrictId] ? DISTRICT_CENTROIDS[initialDistrictId][0] : 9.9816,
    lng: DISTRICT_CENTROIDS[initialDistrictId] ? DISTRICT_CENTROIDS[initialDistrictId][1] : 76.2999,
    is_gps: false,
    status: 'DISTRICT_CENTROID',
    message: 'District reference centroid. Click "Locate Me (GPS)" to acquire live device coordinates for routing.'
  });
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Road Routing States
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routedFacility, setRoutedFacility] = useState<ReliefFacility | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState<boolean>(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [isStepsExpanded, setIsStepsExpanded] = useState<boolean>(false);

  // GPS Permission Prompt Modal State
  const [showGpsPromptModal, setShowGpsPromptModal] = useState<boolean>(false);
  const [pendingRouteFacility, setPendingRouteFacility] = useState<ReliefFacility | null>(null);

  // Live Occupancy, Reservation, & Allocation States
  const [groupSize, setGroupSize] = useState<number>(1);
  const [activeReservation, setActiveReservation] = useState<ReservationResponse | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');

  // Reservation Dialog
  const [isReserving, setIsReserving] = useState<boolean>(false);
  const [reserveFacility, setReserveFacility] = useState<ReliefFacility | null>(null);
  const [citizenContact, setCitizenContact] = useState<string>('');
  const [reserveNotes, setReserveNotes] = useState<string>('');
  const [isSubmittingReservation, setIsSubmittingReservation] = useState<boolean>(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationSuccessMsg, setReservationSuccessMsg] = useState<string | null>(null);

  // Intelligent Recommendation State
  const [recommendation, setRecommendation] = useState<ShelterRecommendationResponse | null>(null);
  const [isRecommending, setIsRecommending] = useState<boolean>(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // Authorized Responder / Staff Mode State
  const [isStaffMode, setIsStaffMode] = useState<boolean>(false);
  const [authenticatedPin, setAuthenticatedPin] = useState<string>('');
  const [showStaffPinModal, setShowStaffPinModal] = useState<boolean>(false);
  const [staffPinInput, setStaffPinInput] = useState<string>('');
  const [staffPinError, setStaffPinError] = useState<string | null>(null);
  const [staffSuccessMsg, setStaffSuccessMsg] = useState<string | null>(null);

  // Staff Edit Capacity Modal
  const [staffEditFacility, setStaffEditFacility] = useState<ReliefFacility | null>(null);
  const [staffIsOperational, setStaffIsOperational] = useState<boolean>(true);
  const [staffVerifiedCap, setStaffVerifiedCap] = useState<number>(100);
  const [staffOccupiedCount, setStaffOccupiedCount] = useState<number>(0);
  const [staffNotes, setStaffNotes] = useState<string>('');
  const [staffIsSimulated, setStaffIsSimulated] = useState<boolean>(false);
  const [isStaffUpdating, setIsStaffUpdating] = useState<boolean>(false);
  const [staffUpdateError, setStaffUpdateError] = useState<string | null>(null);

  // 1. Initial Data Loading
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchDataset() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await loadReliefFacilities();
        if (isMounted) {
          setFacilities(res.facilities);
          setIsOffline(res.isOffline);
          setSourceDate(res.sourceDate);
        }
      } catch (err: any) {
        console.error('Failed to load relief facilities:', err);
        if (isMounted) {
          setErrorMsg(err.message || 'Failed to load relief camps dataset.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchDataset();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Load local active reservation on mount
  useEffect(() => {
    if (!isOpen) return;
    const existing = getLocalReservation();
    if (existing) {
      const expiresAt = new Date(existing.expires_at).getTime();
      if (existing.status === 'ACTIVE' && Date.now() > expiresAt) {
        clearLocalReservation();
        setActiveReservation(null);
      } else {
        setActiveReservation(existing);
      }
    }
  }, [isOpen]);

  // Reservation countdown ticker
  useEffect(() => {
    if (!activeReservation || activeReservation.status !== 'ACTIVE') {
      setCountdownText('');
      return;
    }

    const updateCountdown = () => {
      const remainingMs = new Date(activeReservation.expires_at).getTime() - Date.now();
      if (remainingMs <= 0) {
        setCountdownText('EXPIRED');
        setActiveReservation((prev) => (prev ? { ...prev, status: 'EXPIRED' } : null));
        clearLocalReservation();
        loadReliefFacilities().then((d) => setFacilities(d.facilities)).catch(() => {});
      } else {
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        setCountdownText(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeReservation]);

  // Reservation & Allocation Handlers
  const handleOpenReserveModal = (fac: ReliefFacility) => {
    setReserveFacility(fac);
    setCitizenContact('');
    setReserveNotes('');
    setReservationError(null);
    setIsReserving(true);
  };

  const handleSubmitReservation = async () => {
    if (!reserveFacility) return;
    setIsSubmittingReservation(true);
    setReservationError(null);
    try {
      const res = await reserveShelterSpace(
        reserveFacility.id,
        groupSize,
        citizenContact.trim() || undefined,
        reserveNotes.trim() || undefined,
        120
      );
      setActiveReservation(res);
      setReservationSuccessMsg(`Hold confirmed for ${res.group_size} person(s). Ref ID: ${res.id}`);
      setIsReserving(false);
      const dataset = await loadReliefFacilities();
      setFacilities(dataset.facilities);
      if (selectedFacility) {
        const refreshed = dataset.facilities.find((f) => f.id === selectedFacility.id);
        if (refreshed) setSelectedFacility(refreshed);
      }
    } catch (err: any) {
      setReservationError(err.message || 'Failed to complete reservation hold.');
    } finally {
      setIsSubmittingReservation(false);
    }
  };

  const handleCheckIn = async (resId: string) => {
    try {
      const updated = await checkInReservation(resId);
      setActiveReservation(updated);
      setReservationSuccessMsg(`Arrival verified! Occupied space confirmed at ${updated.shelter_name}.`);
      const dataset = await loadReliefFacilities();
      setFacilities(dataset.facilities);
      if (selectedFacility) {
        const refreshed = dataset.facilities.find((f) => f.id === selectedFacility.id);
        if (refreshed) setSelectedFacility(refreshed);
      }
    } catch (err: any) {
      alert(err.message || 'Check-in failed.');
    }
  };

  const handleCancelReservation = async (resId: string) => {
    if (!window.confirm('Cancel this active reservation hold and release capacity for others?')) return;
    try {
      await cancelReservation(resId, 'Cancelled by citizen');
      setActiveReservation(null);
      clearLocalReservation();
      setReservationSuccessMsg('Reservation cancelled. Capacity released back to shelter.');
      const dataset = await loadReliefFacilities();
      setFacilities(dataset.facilities);
      if (selectedFacility) {
        const refreshed = dataset.facilities.find((f) => f.id === selectedFacility.id);
        if (refreshed) setSelectedFacility(refreshed);
      }
    } catch (err: any) {
      alert(err.message || 'Cancellation failed.');
    }
  };

  const handleGetRecommendation = async () => {
    setIsRecommending(true);
    setRecommendationError(null);
    try {
      const rec = await getShelterRecommendation(
        userLocation.lat,
        userLocation.lng,
        groupSize,
        selectedDistrict
      );
      setRecommendation(rec);
      if (rec.primary_recommendation) {
        const match = facilities.find((f) => f.id === rec.primary_recommendation?.shelter_id);
        if (match) {
          setSelectedFacility(match);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([match.latitude, match.longitude], 12);
          }
        }
      }
    } catch (err: any) {
      setRecommendationError(err.message || 'Recommendation failed.');
    } finally {
      setIsRecommending(false);
    }
  };

  const handleVerifyStaffPin = () => {
    const pin = staffPinInput.trim().toLowerCase();
    if (pin === 'kerala112' || pin === 'ksdma2026' || pin === 'responder999') {
      setIsStaffMode(true);
      setAuthenticatedPin(pin);
      setShowStaffPinModal(false);
      setStaffPinError(null);
    } else {
      setStaffPinError('Invalid responder PIN. Access restricted to authorized personnel.');
    }
  };

  const handleOpenStaffEdit = (fac: ReliefFacility) => {
    setStaffEditFacility(fac);
    setStaffIsOperational(fac.occupancy?.is_operational ?? true);
    setStaffVerifiedCap(fac.occupancy?.verified_operational_capacity ?? fac.capacity_persons ?? 100);
    setStaffOccupiedCount(fac.occupancy?.occupied_count ?? 0);
    setStaffNotes(fac.occupancy?.verification_notes ?? 'Verified by Taluk Incident Command.');
    setStaffIsSimulated(fac.occupancy?.is_simulated ?? false);
    setStaffUpdateError(null);
  };

  const handleSaveStaffCapacity = async () => {
    if (!staffEditFacility) return;
    const pinToUse = authenticatedPin || staffPinInput.trim().toLowerCase();
    if (!pinToUse) {
      setStaffUpdateError('Authorized responder PIN is required.');
      return;
    }

    setIsStaffUpdating(true);
    setStaffUpdateError(null);
    try {
      const updatedOcc = await staffUpdateCapacity(
        staffEditFacility.id,
        staffIsOperational,
        staffVerifiedCap,
        staffOccupiedCount,
        staffNotes,
        pinToUse,
        staffIsSimulated
      );

      // 1. Immediately update in memory for active facilities list
      setFacilities((prev) =>
        prev.map((f) => (f.id === staffEditFacility.id ? { ...f, occupancy: updatedOcc } : f))
      );

      // 2. Immediately update selectedFacility if currently viewing this facility
      if (selectedFacility && selectedFacility.id === staffEditFacility.id) {
        setSelectedFacility((prev) => (prev ? { ...prev, occupancy: updatedOcc } : null));
      }

      setStaffSuccessMsg(
        `Verified capacity successfully updated for ${staffEditFacility.name}: ${updatedOcc.verified_operational_capacity} beds capacity (${updatedOcc.occupied_count} occupied, ${updatedOcc.available_count} available).`
      );
      setStaffEditFacility(null);

      // 3. Re-fetch full dataset from backend to confirm database persistence
      const dataset = await loadReliefFacilities();
      setFacilities(dataset.facilities);
      if (selectedFacility) {
        const refreshed = dataset.facilities.find((f) => f.id === selectedFacility.id);
        if (refreshed) setSelectedFacility(refreshed);
      }
    } catch (err: any) {
      setStaffUpdateError(err.message || 'Capacity update failed.');
    } finally {
      setIsStaffUpdating(false);
    }
  };

  // Request browser GPS position
  const handleLocateMe = async () => {
    setIsLocating(true);
    const fallback = DISTRICT_CENTROIDS[selectedDistrict] || [9.9816, 76.2999];
    const loc = await requestUserLocation(fallback[0], fallback[1]);
    setUserLocation(loc);
    setIsLocating(false);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([loc.lat, loc.lng], 12);
    }
    return loc;
  };

  // 2. Filter & Sort Facilities
  const filteredAndSortedFacilities = useMemo(() => {
    let list = facilities;

    // Filter by district
    if (selectedDistrict !== 'all') {
      list = list.filter((f) => f.district_id === selectedDistrict);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (f) =>
          (f.name || '').toLowerCase().includes(q) ||
          (f.village || '').toLowerCase().includes(q) ||
          (f.lsg || '').toLowerCase().includes(q) ||
          (f.district_name || '').toLowerCase().includes(q)
      );
    }

    // Calculate straight-line proximity to reference position
    return sortFacilitiesByProximity(userLocation.lat, userLocation.lng, list);
  }, [facilities, selectedDistrict, searchQuery, userLocation]);

  // 3. Road Routing Actions
  const handleTriggerRoute = async (targetFacility: ReliefFacility) => {
    // If user has not granted real GPS permission, prompt explicitly rather than routing from centroid
    if (!userLocation.is_gps) {
      setPendingRouteFacility(targetFacility);
      setShowGpsPromptModal(true);
      return;
    }

    setIsRoutingLoading(true);
    setRoutingError(null);
    setRoutedFacility(targetFacility);
    setSelectedFacility(targetFacility);

    try {
      const route = await fetchRoadRoute(
        userLocation.lat,
        userLocation.lng,
        targetFacility.latitude,
        targetFacility.longitude
      );
      setActiveRoute(route);
      setIsStepsExpanded(false);
    } catch (err: any) {
      console.warn('Road routing failed:', err);
      setRoutingError(err.message || 'Unable to calculate road route to this facility.');
      setActiveRoute(null);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
    setRoutedFacility(null);
    setRoutingError(null);
    setIsStepsExpanded(false);

    if (routeLayerGroupRef.current) {
      routeLayerGroupRef.current.clearLayers();
    }

    // Reset map view to user position or district centroid
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 11, { animate: true });
    }
  };

  // 4. Initialize and Maintain Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [userLocation.lat, userLocation.lng],
        zoom: 11,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors | SEOC Relief Registry (2020)'
      }).addTo(map);

      // Dedicated Route LayerGroup (always drawn over tiles, below cluster popups)
      const routeLayerGroup = L.layerGroup().addTo(map);
      routeLayerGroupRef.current = routeLayerGroup;

      // Cluster Group for Facilities
      const clusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
      });
      map.addLayer(clusterGroup);

      clusterGroupRef.current = clusterGroup;
      mapInstanceRef.current = map;

      // Attach click handler for popup buttons
      map.on('popupopen', (e) => {
        const el = e.popup.getElement();
        if (!el) return;
        const btn = el.querySelector('.btn-get-route-popup') as HTMLButtonElement | null;
        if (btn) {
          const facId = btn.getAttribute('data-facility-id');
          btn.onclick = (evt) => {
            evt.stopPropagation();
            const fac = facilities.find((f) => f.id === facId);
            if (fac) {
              handleTriggerRoute(fac);
            }
          };
        }
        const verifyBtn = el.querySelector('.btn-verify-staff-popup') as HTMLButtonElement | null;
        if (verifyBtn) {
          const facId = verifyBtn.getAttribute('data-verify-facility-id');
          verifyBtn.onclick = (evt) => {
            evt.stopPropagation();
            const fac = facilities.find((f) => f.id === facId);
            if (fac) {
              handleOpenStaffEdit(fac);
            }
          };
        }
      });
    }

    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    // Clear previous facility markers
    clusterGroup.clearLayers();
    markerLookupRef.current.clear();

    // User GPS / Reference Marker
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
    }

    const userIconHtml = `
      <div style="
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: ${userLocation.is_gps ? '#0284C7' : '#64748B'};
        border: 3px solid #FFFFFF;
        box-shadow: 0 0 0 4px ${userLocation.is_gps ? 'rgba(2, 132, 199, 0.35)' : 'rgba(100, 116, 139, 0.25)'};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #FFFFFF;"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userIconHtml,
      className: 'user-gps-marker',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const userMarker = L.marker([userLocation.lat, userLocation.lng], {
      icon: userIcon,
      zIndexOffset: 1000
    }).addTo(map);

    userMarker.bindPopup(`
      <div style="font-family: Inter, sans-serif; font-size: 12px; color: #172B4D;">
        <strong style="color: ${userLocation.is_gps ? '#0284C7' : '#475569'};">
          ${userLocation.is_gps ? '📍 Your Live GPS Location' : '📍 District Reference Centroid'}
        </strong><br/>
        <span>${userLocation.message}</span>
      </div>
    `);
    userMarkerRef.current = userMarker;

    // Render Clustered Relief Facility Markers
    const renderLimit = Math.min(filteredAndSortedFacilities.length, 1500);
    const markersToAdd: L.Marker[] = [];

    for (let i = 0; i < renderLimit; i++) {
      const fac = filteredAndSortedFacilities[i];
      const isSelected = selectedFacility?.id === fac.id;
      const isRouted = routedFacility?.id === fac.id;

      let markerBg = '#0D9488'; // Default Teal
      if (isRouted) markerBg = '#2563EB'; // Vibrant Blue for Routed Destination
      else if (isSelected) markerBg = '#D97706'; // Amber for Selected

      const shelterIconHtml = `
        <div style="
          width: ${isSelected || isRouted ? '28px' : '20px'};
          height: ${isSelected || isRouted ? '28px' : '20px'};
          border-radius: 50%;
          background: ${markerBg};
          border: 2px solid #FFFFFF;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
        ">
          <svg width="${isSelected || isRouted ? '14' : '10'}" height="${isSelected || isRouted ? '14' : '10'}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
      `;

      const shelterIcon = L.divIcon({
        html: shelterIconHtml,
        className: 'shelter-marker-icon',
        iconSize: [isSelected || isRouted ? 28 : 20, isSelected || isRouted ? 28 : 20],
        iconAnchor: [isSelected || isRouted ? 14 : 10, isSelected || isRouted ? 14 : 10]
      });

      const marker = L.marker([fac.latitude, fac.longitude], { icon: shelterIcon });

      const occ = fac.occupancy;
      const isVerified = Boolean(occ?.is_operational && occ?.verified_operational_capacity !== null && occ?.verified_operational_capacity !== undefined);

      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4; color: #172B4D; min-width: 230px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: 700; color: #0D9488; background: #E6F7F7; padding: 2px 6px; border-radius: 4px;">
              ${fac.district_name}
            </span>
            ${fac.distance_km !== undefined ? `<span style="font-size: 11px; font-weight: 600; color: #0284C7;">• ${fac.distance_km} km (Direct)</span>` : ''}
          </div>
          <strong style="font-size: 13px; color: #0F172A; display: block; margin-bottom: 4px;">
            ${fac.name}
          </strong>

          ${
            isVerified ? `
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                <span style="font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 3px; background: ${
                  occ?.status === 'AVAILABLE' ? '#DCFCE7' : occ?.status === 'LIMITED' ? '#FEF3C7' : '#FEE2E2'
                }; color: ${
                  occ?.status === 'AVAILABLE' ? '#15803D' : occ?.status === 'LIMITED' ? '#B45309' : '#B91C1C'
                }; border: 1px solid ${
                  occ?.status === 'AVAILABLE' ? '#86EFAC' : occ?.status === 'LIMITED' ? '#FDE68A' : '#FCA5A5'
                };">
                  ${occ?.status}
                </span>
                <span style="font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; ${
                  occ?.is_simulated ? 'background: #E0F2FE; color: #0369A1; border: 1px solid #7DD3FC;' : 'background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC;'
                }">
                  ${occ?.is_simulated ? 'SIMULATED' : 'OFFICIAL VERIFIED'}
                </span>
              </div>

              <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; font-size: 10px; margin-bottom: 5px;">
                  <div><span style="color:#64748B;">Occupied:</span> <strong style="color:#DC2626;">${occ?.occupied_count} / ${occ?.verified_operational_capacity}</strong></div>
                  <div><span style="color:#64748B;">Reserved:</span> <strong style="color:#D97706;">${occ?.reserved_count}</strong></div>
                  <div><span style="color:#64748B;">Available:</span> <strong style="color:#16A34A;">${occ?.available_count} / ${occ?.verified_operational_capacity}</strong></div>
                  <div><span style="color:#64748B;">Capacity:</span> <strong style="color:#1E293B;">${occ?.verified_operational_capacity} people</strong></div>
                </div>
                <div style="width: 100%; height: 6px; background-color: #DCFCE7; border-radius: 3px; overflow: hidden; display: flex; border: 1px solid #CBD5E1;">
                  <div style="width: ${Math.min(100, Math.round(((occ?.occupied_count || 0) / Math.max(1, occ?.verified_operational_capacity || 1)) * 100))}%; background-color: #EF4444;"></div>
                  <div style="width: ${Math.min(100 - Math.round(((occ?.occupied_count || 0) / Math.max(1, occ?.verified_operational_capacity || 1)) * 100), Math.round(((occ?.reserved_count || 0) / Math.max(1, occ?.verified_operational_capacity || 1)) * 100))}%; background-color: #F59E0B;"></div>
                </div>
              </div>
            ` : `
              <div style="display: inline-block; margin-bottom: 6px;">
                <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1;">
                  UNVERIFIED
                </span>
              </div>

              <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                <div style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 2px;">
                  Operational capacity not verified
                </div>
                <div style="font-size: 10px; color: #64748B;">
                  Historical registry baseline: ${fac.capacity_persons ? `${fac.capacity_persons} potential beds` : 'Capacity unrecorded'}
                </div>
                <div style="font-size: 9px; color: #94A3B8; margin-top: 2px;">
                  Do not assume capacity or operational readiness without confirmation.
                </div>
              </div>
            `
          }

          <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
            <span><strong>Village:</strong> ${fac.village || 'N/A'}</span> | 
            <span><strong>LSG:</strong> ${fac.lsg || 'N/A'}</span><br/>
            <span><strong>Type:</strong> ${fac.facility_type || 'General'}</span>
          </div>

          <div style="padding: 4px 6px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 4px; font-size: 10px; color: #92400E; margin-bottom: 8px;">
            ⚠️ <em>${isVerified ? 'Confirmed operational center.' : 'Historical 2020 Registry. Call 1077 / 112 before moving.'}</em>
          </div>

          <button
            data-facility-id="${fac.id}"
            class="btn-get-route-popup"
            style="
              width: 100%;
              padding: 6px 10px;
              background-color: #2563EB;
              color: #FFFFFF;
              border: none;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
            "
          >
            🚗 Get Road Route
          </button>
          ${isStaffMode ? `
            <button
              data-verify-facility-id="${fac.id}"
              class="btn-verify-staff-popup"
              style="
                width: 100%;
                margin-top: 5px;
                padding: 5px 8px;
                background-color: #7C3AED;
                color: #FFFFFF;
                border: none;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
              "
            >
              ⚙️ Verify Operational Capacity
            </button>
          ` : ''}
        </div>
      `);

      marker.on('click', () => {
        setSelectedFacility(fac);
      });

      markersToAdd.push(marker);
      markerLookupRef.current.set(fac.id, marker);
    }

    clusterGroup.addLayers(markersToAdd);
  }, [isOpen, filteredAndSortedFacilities, userLocation, selectedFacility, routedFacility, isStaffMode]);

  // 5. Draw Active Route Line on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    if (activeRoute && activeRoute.coordinates && activeRoute.coordinates.length >= 2) {
      // Outer halo for high-contrast visibility against map tiles
      L.polyline(activeRoute.coordinates, {
        color: '#1E40AF',
        weight: 8,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeGroup);

      // Main route polyline
      const routeLine = L.polyline(activeRoute.coordinates, {
        color: '#2563EB',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeGroup);

      // Automatically fit map view to show full route from origin to destination
      map.fitBounds(routeLine.getBounds(), {
        padding: [60, 60],
        maxZoom: 16
      });
    }
  }, [activeRoute]);

  // Focus facility from list
  const handleSelectFacilityFromList = (fac: ReliefFacility) => {
    setSelectedFacility(fac);
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([fac.latitude, fac.longitude], 15, { animate: true });
      const marker = markerLookupRef.current.get(fac.id);
      if (marker) {
        setTimeout(() => marker.openPopup(), 200);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="dash-card-elevated"
        style={{
          width: '100%',
          maxWidth: '1360px',
          height: '94vh',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-elevated)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'var(--bg-navy-header)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-navy)',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--brand-teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Compass size={18} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                  Kerala Relief Centers & Evacuation Safe-Spots Map
                </h2>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: isOffline ? 'rgba(217, 154, 22, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: isOffline ? '#FDE68A' : '#A7F3D0',
                    border: `1px solid ${isOffline ? 'rgba(217, 154, 22, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Database size={11} />
                  {isOffline ? 'OFFLINE LOCAL DATASET' : 'LIVE API SYNC'}
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-inverse-muted)', margin: '2px 0 0 0' }}>
                SEOC GIS Verified Registry ({facilities.length.toLocaleString()} Mapped Facilities across Kerala • Compiled: {sourceDate})
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Party Size Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Number of people traveling together for shelter capacity allocation"
            >
              <Users size={13} color="#93C5FD" />
              <span style={{ fontSize: '0.72rem', color: '#E2E8F0', fontWeight: 600 }}>Party:</span>
              <select
                value={groupSize}
                onChange={(e) => setGroupSize(Number(e.target.value))}
                style={{
                  backgroundColor: '#1E293B',
                  color: '#FFFFFF',
                  border: '1px solid #475569',
                  borderRadius: '3px',
                  fontSize: '0.72rem',
                  padding: '2px 4px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'person' : 'people'}
                  </option>
                ))}
              </select>
            </div>

            {/* Smart Safe-Spot Recommendation Button */}
            <button
              onClick={handleGetRecommendation}
              disabled={isRecommending}
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: '#FDE68A',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Intelligently recommends the best verified safe-spot with available beds, falling back if nearest is full."
            >
              <Sparkles size={13} color="#F59E0B" className={isRecommending ? 'animate-spin' : ''} />
              {isRecommending ? 'Analyzing Capacity...' : 'Smart Safe-Spot'}
            </button>

            {/* Responder / Staff Mode Button */}
            {isStaffMode ? (
              <button
                onClick={() => setIsStaffMode(false)}
                style={{
                  backgroundColor: '#7C3AED',
                  color: '#FFFFFF',
                  border: '1px solid #A78BFA',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Staff mode active. Click to return to regular citizen view."
              >
                <ShieldCheck size={13} color="#A7F3D0" />
                Staff Active (Exit)
              </button>
            ) : (
              <button
                onClick={() => {
                  setStaffPinInput('');
                  setStaffPinError(null);
                  setShowStaffPinModal(true);
                }}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#E2E8F0',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Authorized responder login to verify operational capacity and record arrivals."
              >
                <Lock size={12} color="#CBD5E1" />
                Responder Access
              </button>
            )}

            {/* Locate Me Button */}
            <button
              onClick={handleLocateMe}
              disabled={isLocating}
              style={{
                backgroundColor: userLocation.is_gps ? 'rgba(2, 132, 199, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                color: userLocation.is_gps ? '#38BDF8' : '#FFFFFF',
                border: `1px solid ${userLocation.is_gps ? '#38BDF8' : 'rgba(255, 255, 255, 0.2)'}`,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Request browser GPS location to calculate nearest shelters & driving routes"
            >
              <Crosshair size={14} className={isLocating ? 'animate-spin' : ''} />
              {isLocating ? 'Locating...' : userLocation.is_gps ? 'GPS Ready' : 'Locate Me (GPS)'}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-inverse-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-xs)'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Critical Disclaimer Banner */}
        <div
          style={{
            backgroundColor: '#FFFBEB',
            borderBottom: '1px solid #FDE68A',
            padding: '8px 16px',
            fontSize: '0.74rem',
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, color: '#D97706' }} />
          <span>
            <strong>Historical Registry Notice:</strong> Facilities reflect the baseline SEOC GIS inventory (August 2020).
            They represent <em>designated potential relief shelters</em>, <strong>not confirmed real-time open or staffed camps</strong>.
            During flood emergencies, call the District Disaster Control Room (<strong>1077</strong>) or Emergency Police/Ambulance (<strong>112</strong>) before evacuating.
          </span>
        </div>

        {/* Global Error Banner if any */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              borderBottom: '1px solid #FECACA',
              padding: '8px 16px',
              fontSize: '0.74rem',
              color: '#991B1B',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={14} color="#DC2626" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            backgroundColor: 'var(--bg-surface-subtle)'
          }}
        >
          {/* District Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              District:
            </span>
            <select
              value={selectedDistrict}
              onChange={(e) => {
                const newDist = e.target.value;
                setSelectedDistrict(newDist);
                if (DISTRICT_CENTROIDS[newDist] && !userLocation.is_gps) {
                  const centroid = DISTRICT_CENTROIDS[newDist];
                  setUserLocation({
                    lat: centroid[0],
                    lng: centroid[1],
                    is_gps: false,
                    status: 'DISTRICT_CENTROID',
                    message: `District reference centroid: ${newDist}. Click "Locate Me" for GPS.`
                  });
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView(centroid, 10);
                  }
                }
              }}
              style={{
                fontSize: '0.78rem',
                padding: '6px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontWeight: 500
              }}
            >
              {KERALA_DISTRICTS_LIST.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div
            style={{
              flex: 1,
              minWidth: '220px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              placeholder="Search by facility name, village, or LSG panchayat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Clear Route Button if Route is Active */}
          {activeRoute && (
            <button
              onClick={handleClearRoute}
              style={{
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #93C5FD',
                padding: '5px 12px',
                borderRadius: 'var(--radius-xs)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RotateCcw size={12} />
              Clear Route Line
            </button>
          )}

          {/* Result Count */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Showing <strong>{filteredAndSortedFacilities.length}</strong> safe-spots
            {selectedDistrict !== 'all' && ` in ${selectedDistrict}`}
          </div>
        </div>

        {/* Main Content: Split Layout (Left Panel + Map) */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 440px) 1fr',
            overflow: 'hidden'
          }}
        >
          {/* Left Column: Route Details + Facilities List */}
          <div
            style={{
              borderRight: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--bg-surface)',
              overflow: 'hidden'
            }}
          >
            {/* GPS Status Indicator */}
            <div
              style={{
                padding: '8px 14px',
                backgroundColor: userLocation.is_gps ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg-surface-subtle)',
                borderBottom: '1px solid var(--border-light)',
                fontSize: '0.72rem',
                color: userLocation.is_gps ? '#0369A1' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Info size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userLocation.message}
              </span>
            </div>

            {/* ROUTE LOADING STATE */}
            {isRoutingLoading && (
              <div
                style={{
                  margin: '10px 14px 4px 14px',
                  padding: '12px 14px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#1D4ED8',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}
              >
                <Loader2 size={16} className="animate-spin" />
                <span>Calculating road route via OSRM highway network...</span>
              </div>
            )}

            {/* ROUTE ERROR BANNER */}
            {routingError && (
              <div
                style={{
                  margin: '10px 14px 4px 14px',
                  padding: '10px 12px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 'var(--radius-sm)',
                  color: '#991B1B',
                  fontSize: '0.74rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <strong>Road Route Unavailable</strong>
                  <button
                    onClick={() => setRoutingError(null)}
                    style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
                <p style={{ margin: '0 0 6px 0', fontSize: '0.72rem', lineHeight: 1.4 }}>{routingError}</p>
                {routedFacility && (
                  <a
                    href={getGoogleMapsDirectionsUrl(userLocation.lat, userLocation.lng, routedFacility.latitude, routedFacility.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.72rem',
                      color: '#DC2626',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={11} />
                    Open directions in Google Maps instead
                  </a>
                )}
              </div>
            )}

            {/* ACTIVE ROUTE DETAILS PANEL */}
            {activeRoute && routedFacility && (
              <div
                style={{
                  margin: '10px 14px 6px 14px',
                  padding: '12px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #93C5FD',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: '#1D4ED8',
                          backgroundColor: '#DBEAFE',
                          padding: '2px 6px',
                          borderRadius: '3px'
                        }}
                      >
                        ROAD ROUTE ACTIVE
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#64748B' }}>via OSRM</span>
                    </div>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E3A8A', margin: '4px 0 2px 0' }}>
                      To: {routedFacility.name}
                    </h4>
                    <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                      {routedFacility.district_name} • {routedFacility.village || routedFacility.lsg || ''}
                    </div>
                  </div>

                  <button
                    onClick={handleClearRoute}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Clear route line and details"
                  >
                    <RotateCcw size={11} />
                    Clear
                  </button>
                </div>

                {/* Metrics Comparison Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Route size={11} color="#2563EB" />
                      ROAD DRIVING DISTANCE
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1D4ED8', margin: '2px 0' }}>
                      {activeRoute.distance_km} km
                    </div>
                    <div style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                      Straight-line distance: <strong>{routedFacility.distance_km ?? 'N/A'} km</strong>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} color="#0284C7" />
                      ESTIMATED TIME
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0369A1', margin: '2px 0' }}>
                      ~{activeRoute.duration_mins} mins
                    </div>
                    <div style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                      Normal road conditions
                    </div>
                  </div>
                </div>

                {/* Flood Inundation & Road Safety Warning */}
                <div
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    color: '#92400E',
                    marginBottom: '8px',
                    lineHeight: 1.35
                  }}
                >
                  <ShieldAlert size={12} style={{ display: 'inline', marginRight: '4px', color: '#D97706' }} />
                  <strong>Flood Warning:</strong> This navigation route uses standard road networks and <strong>does not</strong> reflect real-time monsoon flood water levels, submerged bridges, or active landslide road closures. Never drive into standing or flowing water.
                </div>

                {/* Turn-by-Turn Steps Toggle & Google Maps Link */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    onClick={() => setIsStepsExpanded(!isStepsExpanded)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#2563EB',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Milestone size={12} />
                    {isStepsExpanded ? 'Hide Turn-by-Turn Steps' : `Show Turn-by-Turn Steps (${activeRoute.steps.length})`}
                    {isStepsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  <a
                    href={activeRoute.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.72rem',
                      color: '#0D9488',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Open live navigation in Google Maps app"
                  >
                    <ExternalLink size={11} />
                    Open in Google Maps
                  </a>
                </div>

                {/* Expanded Steps List */}
                {isStepsExpanded && (
                  <div
                    style={{
                      marginTop: '8px',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      backgroundColor: '#FFFFFF',
                      borderRadius: '6px',
                      border: '1px solid #E2E8F0',
                      padding: '6px 10px',
                      fontSize: '0.7rem'
                    }}
                  >
                    {activeRoute.steps.length === 0 ? (
                      <p style={{ margin: '4px 0', color: '#64748B' }}>Direct road connection without intermediate turn maneuvers.</p>
                    ) : (
                      activeRoute.steps.map((st, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '4px 0',
                            borderBottom: idx < activeRoute.steps.length - 1 ? '1px solid #F1F5F9' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '6px',
                            lineHeight: 1.3
                          }}
                        >
                          <span style={{ color: '#1E293B' }}>
                            <strong>{idx + 1}.</strong> {st.instruction}
                          </span>
                          <span style={{ color: '#64748B', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {st.distance_m > 1000 ? `${(st.distance_m / 1000).toFixed(1)} km` : `${st.distance_m} m`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Privacy Disclosure */}
                <div style={{ marginTop: '8px', fontSize: '0.64rem', color: '#64748B', borderTop: '1px solid #DBEAFE', paddingTop: '6px' }}>
                  🔒 <strong>Privacy:</strong> Origin and destination coordinates were transmitted securely to the OSRM routing provider solely to compute this line. ResQNet does not store or track your movement.
                </div>
              </div>
            )}

            {/* Scrollable Facility Cards */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {/* Staff Success Notification Alert */}
              {staffSuccessMsg && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#F5F3FF',
                    border: '1px solid #C4B5FD',
                    borderRadius: 'var(--radius-sm)',
                    color: '#5B21B6',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} color="#7C3AED" />
                    <span>{staffSuccessMsg}</span>
                  </div>
                  <button
                    onClick={() => setStaffSuccessMsg(null)}
                    style={{ background: 'none', border: 'none', color: '#5B21B6', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Success Notification Alert */}
              {reservationSuccessMsg && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #6EE7B7',
                    borderRadius: 'var(--radius-sm)',
                    color: '#065F46',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} color="#059669" />
                    <span>{reservationSuccessMsg}</span>
                  </div>
                  <button
                    onClick={() => setReservationSuccessMsg(null)}
                    style={{ background: 'none', border: 'none', color: '#065F46', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Recommendation Error Alert */}
              {recommendationError && (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: 'var(--radius-sm)',
                    color: '#991B1B',
                    fontSize: '0.74rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} color="#DC2626" />
                    <span>{recommendationError}</span>
                  </div>
                  <button
                    onClick={() => setRecommendationError(null)}
                    style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Active Reservation Banner / Card */}
              {activeReservation && (
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: activeReservation.status === 'CHECKED_IN' ? '#F0FDF4' : '#FEF3C7',
                    border: `2px solid ${activeReservation.status === 'CHECKED_IN' ? '#86EFAC' : '#F59E0B'}`,
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-card)',
                    marginBottom: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: activeReservation.status === 'CHECKED_IN' ? '#15803D' : '#D97706',
                            color: '#FFFFFF'
                          }}
                        >
                          {activeReservation.status === 'CHECKED_IN' ? 'CONFIRMED CHECKED-IN' : 'ACTIVE CITIZEN HOLD'}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E293B' }}>
                          ID: {activeReservation.id}
                        </span>
                      </div>
                      <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '4px 0 2px 0', color: '#0F172A' }}>
                        {activeReservation.shelter_name}
                      </h4>
                      <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                        Reserved for <strong>{activeReservation.group_size} person(s)</strong> • District: {activeReservation.district_id}
                      </div>
                    </div>

                    {activeReservation.status === 'ACTIVE' && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.62rem', color: '#92400E', fontWeight: 600 }}>HOLD EXPIRES IN</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#B45309' }}>
                          {countdownText || 'Active'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions: Check In, Cancel, Route */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {activeReservation.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleCheckIn(activeReservation.id)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: '#15803D',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px'
                        }}
                        title="Click upon arrival at shelter to confirm bed and change status to occupied"
                      >
                        <CheckCircle2 size={13} />
                        Confirm Arrival (Check-In)
                      </button>
                    )}

                    {activeReservation.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleCancelReservation(activeReservation.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: '#FFFFFF',
                          color: '#991B1B',
                          border: '1px solid #FCA5A5',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Cancel Hold
                      </button>
                    )}

                    {(() => {
                      const targetFac = facilities.find((f) => f.id === activeReservation.shelter_id);
                      if (targetFac) {
                        return (
                          <button
                            onClick={() => handleTriggerRoute(targetFac)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: '#2563EB',
                              color: '#FFFFFF',
                              border: 'none',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Navigation2 size={12} />
                            Route to Shelter
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {/* Intelligent Safe-Spot Recommendation Banner */}
              {recommendation && recommendation.primary_recommendation && (
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: '#EFF6FF',
                    border: '2px solid #3B82F6',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-card)',
                    marginBottom: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} color="#2563EB" />
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1D4ED8' }}>
                        RECOMMENDED SAFE-SPOT ALLOCATION (PARTY OF {recommendation.group_size})
                      </span>
                    </div>
                    <button
                      onClick={() => setRecommendation(null)}
                      style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '13px' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Fallback Warning if nearest facility was full */}
                  {recommendation.nearest_facility_was_full && (
                    <div
                      style={{
                        margin: '6px 0',
                        padding: '6px 8px',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        color: '#991B1B',
                        lineHeight: 1.4
                      }}
                    >
                      ⚠️ <strong>Capacity Notice:</strong> The closest shelter
                      {recommendation.nearest_full_facility_name ? ` ("${recommendation.nearest_full_facility_name}")` : ''} is currently <strong>FULL</strong> or cannot accommodate your party of {recommendation.group_size}. Automatically rerouted to the nearest verified available shelter.
                    </div>
                  )}

                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '4px 0 2px 0', color: '#0F172A' }}>
                    {recommendation.primary_recommendation.name}
                  </h4>

                  <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '6px' }}>
                    {recommendation.primary_recommendation.district_name} • 
                    Road Est: <strong>{recommendation.primary_recommendation.estimated_road_distance_km ?? 'N/A'} km</strong> • 
                    Direct: <strong>{recommendation.primary_recommendation.straight_line_distance_km} km</strong> • 
                    Available: <strong style={{ color: '#059669' }}>{recommendation.primary_recommendation.available_capacity} beds free</strong>
                  </div>

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.68rem', color: '#64748B', fontStyle: 'italic' }}>
                    {recommendation.primary_recommendation.recommendation_reason}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(() => {
                      const targetFac = facilities.find((f) => f.id === recommendation.primary_recommendation?.shelter_id);
                      if (targetFac) {
                        return (
                          <>
                            <button
                              onClick={() => {
                                setSelectedFacility(targetFac);
                                handleTriggerRoute(targetFac);
                              }}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Navigation2 size={12} />
                              Route to Safe-Spot
                            </button>

                            {targetFac.occupancy?.is_operational && targetFac.occupancy.available_count >= groupSize && (
                              <button
                                onClick={() => handleOpenReserveModal(targetFac)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 'var(--radius-xs)',
                                  backgroundColor: '#059669',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Reserve ({groupSize} Beds)
                              </button>
                            )}
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                  <div className="animate-spin" style={{ display: 'inline-block', marginBottom: '8px' }}>
                    <Compass size={24} color="var(--brand-teal)" />
                  </div>
                  <p style={{ fontSize: '0.8rem', margin: 0 }}>Loading Kerala Relief Facilities...</p>
                </div>
              ) : filteredAndSortedFacilities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                  <Building size={28} style={{ opacity: 0.4, marginBottom: '6px' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>No matching facilities found</p>
                  <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Try clearing search filters or selecting another district.
                  </p>
                </div>
              ) : (
                filteredAndSortedFacilities.slice(0, 100).map((fac, idx) => {
                  const isSelected = selectedFacility?.id === fac.id;
                  const isRoutedHere = routedFacility?.id === fac.id && activeRoute !== null;
                  const occ = fac.occupancy;
                  const isAvailForGroup = (occ?.is_operational && (occ.available_count >= groupSize));

                  return (
                    <div
                      key={fac.id}
                      onClick={() => handleSelectFacilityFromList(fac)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: isRoutedHere
                          ? '2px solid #2563EB'
                          : isSelected
                          ? '2px solid var(--brand-teal)'
                          : '1px solid var(--border-light)',
                        backgroundColor: isRoutedHere
                          ? '#EFF6FF'
                          : isSelected
                          ? 'var(--brand-teal-light)'
                          : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected || isRoutedHere ? 'var(--shadow-card)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                backgroundColor: isRoutedHere ? '#DBEAFE' : '#E2E8F0',
                                color: isRoutedHere ? '#1E40AF' : '#334155',
                                padding: '1px 5px',
                                borderRadius: '3px'
                              }}
                            >
                              #{idx + 1}
                            </span>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                color: isRoutedHere ? '#2563EB' : 'var(--brand-teal)'
                              }}
                            >
                              {fac.district_name}
                            </span>
                          </div>
                          <h4
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              margin: '0 0 4px 0',
                              lineHeight: 1.3
                            }}
                          >
                            {fac.name}
                          </h4>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {fac.village && <span>Village: {fac.village} • </span>}
                            {fac.lsg && <span>LSG: {fac.lsg}</span>}
                          </div>
                        </div>

                        {/* Straight-line Distance Badge */}
                        {fac.distance_km !== undefined && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 800,
                                color: isRoutedHere ? '#2563EB' : '#0284C7',
                                display: 'block'
                              }}
                            >
                              {fac.distance_km} km
                            </span>
                            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                              Straight-line
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Live Occupancy Status & Explicit Metrics */}
                      {occ && (
                        <div
                          style={{
                            marginTop: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  backgroundColor:
                                    occ.status === 'AVAILABLE' ? '#DCFCE7' :
                                    occ.status === 'LIMITED' ? '#FEF3C7' :
                                    occ.status === 'FULL' ? '#FEE2E2' : '#F1F5F9',
                                  color:
                                    occ.status === 'AVAILABLE' ? '#15803D' :
                                    occ.status === 'LIMITED' ? '#B45309' :
                                    occ.status === 'FULL' ? '#B91C1C' : '#475569',
                                  border: `1px solid ${
                                    occ.status === 'AVAILABLE' ? '#86EFAC' :
                                    occ.status === 'LIMITED' ? '#FDE68A' :
                                    occ.status === 'FULL' ? '#FCA5A5' : '#CBD5E1'
                                  }`
                                }}
                              >
                                {occ.status}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  backgroundColor: occ.is_simulated ? '#E0F2FE' : '#DCFCE7',
                                  color: occ.is_simulated ? '#0369A1' : '#15803D',
                                  border: `1px solid ${occ.is_simulated ? '#7DD3FC' : '#86EFAC'}`
                                }}
                              >
                                {occ.is_simulated ? 'SIMULATED' : 'OFFICIAL VERIFIED'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                              {occ.is_operational && occ.verified_operational_capacity !== null && occ.verified_operational_capacity !== undefined ? (
                                <span style={{ color: occ.available_count > 0 ? '#15803D' : '#DC2626' }}>
                                  {occ.available_count} beds free
                                </span>
                              ) : (
                                <span style={{ color: '#64748B', fontWeight: 500 }}>Unverified</span>
                              )}
                            </div>
                          </div>

                          {occ.is_operational && occ.verified_operational_capacity !== null && occ.verified_operational_capacity !== undefined ? (
                            <div>
                              {/* Explicit 4 values required by specification */}
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(2, 1fr)',
                                  gap: '3px 8px',
                                  fontSize: '0.72rem',
                                  backgroundColor: '#FFFFFF',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #E2E8F0',
                                  marginBottom: '6px'
                                }}
                              >
                                <div>
                                  <span style={{ color: '#64748B' }}>Occupied: </span>
                                  <strong style={{ color: '#DC2626' }}>
                                    {occ.occupied_count} / {occ.verified_operational_capacity}
                                  </strong>
                                </div>
                                <div>
                                  <span style={{ color: '#64748B' }}>Reserved: </span>
                                  <strong style={{ color: '#D97706' }}>
                                    {occ.reserved_count}
                                  </strong>
                                </div>
                                <div>
                                  <span style={{ color: '#64748B' }}>Available: </span>
                                  <strong style={{ color: '#16A34A' }}>
                                    {occ.available_count} / {occ.verified_operational_capacity}
                                  </strong>
                                </div>
                                <div>
                                  <span style={{ color: '#64748B' }}>Capacity: </span>
                                  <strong style={{ color: '#1E293B' }}>
                                    {occ.verified_operational_capacity} people
                                  </strong>
                                </div>
                              </div>

                              {/* Progress bar based on occupied + active reserved spaces */}
                              <div style={{ width: '100%', height: '7px', backgroundColor: '#DCFCE7', borderRadius: '4px', overflow: 'hidden', display: 'flex', border: '1px solid #CBD5E1' }}>
                                <div
                                  style={{
                                    width: `${Math.min(100, Math.round((occ.occupied_count / Math.max(1, occ.verified_operational_capacity)) * 100))}%`,
                                    backgroundColor: '#EF4444',
                                    transition: 'width 0.2s ease'
                                  }}
                                  title={`Occupied: ${occ.occupied_count} / ${occ.verified_operational_capacity}`}
                                />
                                <div
                                  style={{
                                    width: `${Math.min(100 - Math.round((occ.occupied_count / Math.max(1, occ.verified_operational_capacity)) * 100), Math.round((occ.reserved_count / Math.max(1, occ.verified_operational_capacity)) * 100))}%`,
                                    backgroundColor: '#F59E0B',
                                    transition: 'width 0.2s ease'
                                  }}
                                  title={`Reserved: ${occ.reserved_count}`}
                                />
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                padding: '6px 8px',
                                backgroundColor: '#FFFFFF',
                                border: '1px dashed #CBD5E1',
                                borderRadius: '4px'
                              }}
                            >
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                                Operational capacity not verified
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                Historical registry baseline: {fac.capacity_persons ? `${fac.capacity_persons} potential beds` : 'Capacity unrecorded'}
                              </div>
                              <div style={{ fontSize: '0.63rem', color: '#94A3B8', marginTop: '2px' }}>
                                Do not imply baseline capacity or current occupancy is confirmed.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Capacity & Ownership Tags */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {fac.facility_type && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: '#475569',
                              backgroundColor: '#F1F5F9',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            Type: {fac.facility_type}
                          </span>
                        )}

                        {fac.ownership && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: '#475569',
                              backgroundColor: '#F1F5F9',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            {fac.ownership}
                          </span>
                        )}
                      </div>

                      {/* Road Routing & Reservation Action Bar */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                          paddingTop: '6px',
                          borderTop: '1px solid var(--border-light)',
                          gap: '6px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerRoute(fac);
                            }}
                            disabled={isRoutingLoading && routedFacility?.id === fac.id}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-xs)',
                              border: isRoutedHere ? '1px solid #2563EB' : '1px solid #CBD5E1',
                              backgroundColor: isRoutedHere ? '#2563EB' : '#FFFFFF',
                              color: isRoutedHere ? '#FFFFFF' : '#1E293B',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isRoutingLoading && routedFacility?.id === fac.id ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Calculating...
                              </>
                            ) : isRoutedHere ? (
                              <>
                                <Navigation2 size={12} color="#FFFFFF" />
                                Active Route
                              </>
                            ) : (
                              <>
                                <Route size={12} color="#2563EB" />
                                Get Road Route
                              </>
                            )}
                          </button>

                          {/* Citizen Reserve Space Button */}
                          {isAvailForGroup ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReserveModal(fac);
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: '#059669',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title={`Reserve space for party of ${groupSize}`}
                            >
                              <Users size={11} />
                              Reserve ({groupSize})
                            </button>
                          ) : occ?.is_operational ? (
                            <span
                              style={{
                                fontSize: '0.66rem',
                                color: '#991B1B',
                                fontWeight: 600,
                                padding: '2px 6px',
                                backgroundColor: '#FEE2E2',
                                borderRadius: '3px'
                              }}
                            >
                              Full for {groupSize}
                            </span>
                          ) : null}

                          {/* Staff Capacity Edit Button (if staff mode is active) */}
                          {isStaffMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStaffEdit(fac);
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: '#7C3AED',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              ⚙️ Verify
                            </button>
                          )}
                        </div>

                        <a
                          href={getGoogleMapsDirectionsUrl(userLocation.lat, userLocation.lng, fac.latitude, fac.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--brand-teal)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 500
                          }}
                          title="Open direct driving directions in Google Maps"
                        >
                          <ExternalLink size={10} />
                          Google Maps
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Offline & Helpline Footer */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface-subtle)',
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <PhoneCall size={12} color="#D97706" />
                <span>Control Room: <strong>1077</strong> / <strong>112</strong></span>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>
                {isOffline ? 'Offline Cache Ready' : 'OSRM Live Routing'}
              </span>
            </div>
          </div>

          {/* Right Column: Leaflet Map */}
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* Map Legend Overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                zIndex: 400,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(4px)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-light)',
                boxShadow: 'var(--shadow-card)',
                fontSize: '0.7rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: userLocation.is_gps ? '#0284C7' : '#64748B' }} />
                <span>{userLocation.is_gps ? 'Live User GPS Position' : 'District Reference Centroid'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0D9488' }} />
                <span>Relief Safe-Spot (SEOC Registry)</span>
              </div>
              {routedFacility && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
                  <span>Routed Evacuation Destination</span>
                </div>
              )}
              {activeRoute && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '14px', height: '3px', backgroundColor: '#2563EB', borderRadius: '2px' }} />
                  <span>Road Driving Route (OSRM)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GPS PERMISSION PROMPT MODAL (Requirement 3: Never silently route from centroid) */}
      {showGpsPromptModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="dash-card-elevated"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '20px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Crosshair size={20} color="#2563EB" />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                Live GPS Location Required for Driving Route
              </h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, marginBottom: '14px' }}>
              Turn-by-turn road navigation requires your real physical GPS location to find the closest road connection.
              Your dashboard is currently centered on a <strong>district centroid reference point</strong>.
            </p>

            <div
              style={{
                padding: '10px 12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '0.74rem',
                color: '#64748B',
                marginBottom: '16px',
                lineHeight: 1.4
              }}
            >
              🔒 <strong>Privacy Commitment:</strong> Your coordinates are transmitted solely to the OpenStreetMap routing provider to compute the requested navigation path. ResQNet does not store, log, or track your movement.
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setShowGpsPromptModal(false);
                  if (pendingRouteFacility) {
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${pendingRouteFacility.latitude},${pendingRouteFacility.longitude}`,
                      '_blank'
                    );
                  }
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Open in Google Maps
              </button>

              <button
                onClick={() => setShowGpsPromptModal(false)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  setShowGpsPromptModal(false);
                  const target = pendingRouteFacility;
                  setIsLocating(true);
                  const loc = await handleLocateMe();
                  setIsLocating(false);
                  if (loc.is_gps && target) {
                    handleTriggerRoute(target);
                  }
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Enable GPS & Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. CITIZEN SHELTER RESERVATION MODAL */}
      {isReserving && reserveFacility && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              maxWidth: '480px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669', backgroundColor: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }}>
                  ATOMIC CAPACITY HOLD
                </span>
                <h3 style={{ margin: '4px 0 2px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Reserve Relief Shelter Space
                </h3>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748B' }}>
                  {reserveFacility.name} ({reserveFacility.district_name})
                </p>
              </div>
              <button
                onClick={() => setIsReserving(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {reservationError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', color: '#991B1B', fontSize: '0.72rem', marginBottom: '12px' }}>
                {reservationError}
              </div>
            )}

            <div style={{ backgroundColor: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', marginBottom: '14px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748B' }}>Party size requested:</span>
                <strong style={{ color: '#0F172A' }}>{groupSize} person(s)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748B' }}>Verified available beds:</span>
                <strong style={{ color: '#059669' }}>{reserveFacility.occupancy?.available_count ?? 'N/A'} beds free</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Hold duration:</span>
                <strong style={{ color: '#B45309' }}>120 minutes (2 hours)</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Contact Name / Phone Alias (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anand K / +91-9876543210"
                  value={citizenContact}
                  onChange={(e) => setCitizenContact(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #CBD5E1'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Special Needs / Elderly / Infant Requirements (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1 elderly person requiring ground-floor bedding"
                  value={reserveNotes}
                  onChange={(e) => setReserveNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #CBD5E1'
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.66rem', color: '#64748B', lineHeight: 1.4, marginBottom: '16px' }}>
              ℹ️ <strong>Capacity Protection:</strong> Your reservation immediately locks {groupSize} bed(s) in the shelter database. If you do not check in within 120 minutes, the hold expires automatically to ensure space for other evacuees.
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsReserving(false)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReservation}
                disabled={isSubmittingReservation}
                style={{
                  padding: '7px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#059669',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {isSubmittingReservation ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Confirm & Lock Space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. AUTHORIZED RESPONDER PIN MODAL */}
      {showStaffPinModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              maxWidth: '400px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Lock size={18} color="#7C3AED" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>
                Authorized Responder Authentication
              </h3>
            </div>
            <p style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: 1.4, marginBottom: '14px' }}>
              To prevent unauthorized changes to shelter capacity counts, entering an authorized responder credential is required.
            </p>

            {staffPinError && (
              <div style={{ padding: '8px 10px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', color: '#991B1B', fontSize: '0.72rem', marginBottom: '12px' }}>
                {staffPinError}
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Responder PIN / Passcode:
              </label>
              <input
                type="password"
                placeholder="Enter authorized responder PIN"
                value={staffPinInput}
                onChange={(e) => setStaffPinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyStaffPin();
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  fontSize: '0.78rem',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1'
                }}
              />
              <span style={{ fontSize: '0.64rem', color: '#94A3B8', marginTop: '3px', display: 'block' }}>
                Security Notice: Enter official responder PIN provided by incident command.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStaffPinModal(false)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyStaffPin}
                style={{
                  padding: '7px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Authenticate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. STAFF CAPACITY UPDATE MODAL */}
      {staffEditFacility && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              maxWidth: '460px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7C3AED', backgroundColor: '#F5F3FF', padding: '2px 6px', borderRadius: '4px' }}>
                  RESPONDER MANAGEMENT CONSOLE
                </span>
                <h3 style={{ margin: '4px 0 2px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  Verify Operational Capacity
                </h3>
                <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748B' }}>
                  {staffEditFacility.name} ({staffEditFacility.district_name})
                </p>
              </div>
              <button
                onClick={() => setStaffEditFacility(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {staffUpdateError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', color: '#991B1B', fontSize: '0.72rem', marginBottom: '12px' }}>
                {staffUpdateError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {/* Active Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#1E293B' }}>
                <input
                  type="checkbox"
                  checked={staffIsOperational}
                  onChange={(e) => setStaffIsOperational(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <span>Camp is Operational & Staffed by District Incident Command</span>
              </label>

              {/* Verified Capacity Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Verified Operational Capacity (Max Staffed Beds):
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={staffVerifiedCap}
                  onChange={(e) => setStaffVerifiedCap(Math.max(0, Number(e.target.value)))}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                />
                <span style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                  Historical SEOC registry baseline: {staffEditFacility.capacity_persons ?? 'Unrecorded'}
                </span>
              </div>

              {/* Occupied Headcount Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Current Occupied Headcount (Verified Arrivals):
                </label>
                <input
                  type="number"
                  min="0"
                  max={staffVerifiedCap}
                  value={staffOccupiedCount}
                  onChange={(e) => setStaffOccupiedCount(Math.max(0, Number(e.target.value)))}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                />
              </div>

              {/* Staff Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                  Field Verification & Resource Notes:
                </label>
                <textarea
                  rows={2}
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="e.g. Medical team stationed, drinking water tankers deployed."
                  style={{ width: '100%', padding: '7px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #CBD5E1', resize: 'none' }}
                />
              </div>

              {/* Simulation Drill Mode Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                <input
                  type="checkbox"
                  checked={staffIsSimulated}
                  onChange={(e) => setStaffIsSimulated(e.target.checked)}
                  style={{ width: '15px', height: '15px' }}
                />
                <span>Simulated Drill Data (Visibly tags shelter as SIMULATED; does not confuse real capacity)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setStaffEditFacility(null)}
                style={{ padding: '7px 12px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStaffCapacity}
                disabled={isStaffUpdating}
                style={{
                  padding: '7px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {isStaffUpdating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Update Live Verification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
