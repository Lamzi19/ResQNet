import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  X,
  Radio,
  MapPin,
  Users,
  ShieldAlert,
  Clock,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import type { SosIncident } from '../services/api';

interface SosEmergencyAlertModalProps {
  incident: SosIncident | null;
  queueCount: number;
  onViewIncident: (incident: SosIncident) => void;
  onAcknowledge: (incident: SosIncident) => void;
  onDismiss: () => void;
}

export const SosEmergencyAlertModal: React.FC<SosEmergencyAlertModalProps> = ({
  incident,
  queueCount,
  onViewIncident,
  onAcknowledge,
  onDismiss
}) => {
  const hasPlayedSoundRef = useRef<string | null>(null);

  // Play subtle emergency tone once per incident if permitted by browser
  useEffect(() => {
    if (!incident || hasPlayedSoundRef.current === incident.id) return;
    hasPlayedSoundRef.current = incident.id;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // Audio autoplay policy might block audio without user gesture; gracefully ignore
    }
  }, [incident]);

  if (!incident) return null;

  const isCritical = incident.priority_level === 'CRITICAL';
  const isHigh = incident.priority_level === 'HIGH';

  const badgeColor = isCritical
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : isHigh
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

  const borderColor = isCritical
    ? 'border-rose-500/50 shadow-rose-950/50'
    : isHigh
    ? 'border-amber-500/50 shadow-amber-950/50'
    : 'border-cyan-500/50 shadow-cyan-950/50';

  const channelLabel = incident.delivery_channel?.includes('BLE')
    ? incident.hop_count && incident.hop_count > 0
      ? `BLE Mesh Relay (${incident.hop_count} hops)`
      : 'Direct BLE Broadcast'
    : 'Internet (Direct)';

  const hasGps = incident.latitude != null && incident.longitude != null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-2xl bg-slate-900 text-slate-100 rounded-2xl border-2 ${borderColor} shadow-2xl overflow-hidden flex flex-col`}
      >
        {/* Top Header Banner */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isCritical ? 'bg-rose-950/50 border-rose-900/60' : 'bg-slate-800/60 border-slate-700/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isCritical
                  ? 'bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/40 animate-pulse'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-rose-400 font-bold">
                  Live Emergency Distress Incident
                </span>
                {queueCount > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                    1 of {queueCount} in queue
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Incident #{incident.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${badgeColor}`}>
                  {incident.priority_level} • Score: {incident.priority_score}/100
                </span>
              </h2>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Dismiss popup (incident remains in left triage queue)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Citizen's Reported Distress Message */}
          <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-2">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <span>Citizen Distress Message</span>
            </div>
            <p className="text-base font-medium text-slate-100 leading-relaxed italic">
              "{incident.description || 'Emergency assistance requested.'}"
            </p>
          </div>

          {/* Key Incident Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* People in Need */}
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>People Needing Rescue</span>
              </div>
              <div className="text-base font-bold text-white">
                {incident.people_count || 1} person{incident.people_count > 1 ? 's' : ''}
              </div>
            </div>

            {/* Vulnerability */}
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Vulnerable Groups</span>
              </div>
              <div className="text-sm font-semibold text-slate-200">
                {incident.vulnerability_flags && incident.vulnerability_flags.length > 0 ? (
                  <span className="text-amber-300 font-medium">Reported Present</span>
                ) : (
                  <span className="text-slate-400">None explicitly reported</span>
                )}
              </div>
            </div>

            {/* Delivery Channel */}
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                <span>Delivery Path</span>
              </div>
              <div className="text-xs font-semibold text-slate-200 truncate" title={channelLabel}>
                {channelLabel}
              </div>
            </div>
          </div>

          {/* Location & GPS Info */}
          <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                Reported Location Details
              </span>
              {incident.created_at && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3" />
                  Reported: {new Date(incident.created_at).toLocaleTimeString()}
                </span>
              )}
            </div>

            {hasGps ? (
              <div className="space-y-1">
                <div className="text-sm font-mono text-emerald-400">
                  {incident.latitude?.toFixed(5)}° N, {incident.longitude?.toFixed(5)}° E
                </div>
                <div className="text-xs text-slate-300 flex items-center gap-2">
                  <span>Sector / District: <strong>{incident.district_name || incident.location_name || 'Operational Sector'}</strong></span>
                  {incident.location_accuracy_m != null && (
                    <span className="text-slate-400">
                      • Accuracy: ±{Math.round(incident.location_accuracy_m)}m
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-300/90 bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/50">
                <strong>GPS Fix Not Acquired:</strong> Citizen distress beacon transmitted without coordinates.
                Requires radio/phone confirmation or BLE gateway proximity triangulation.
              </div>
            )}
          </div>

          {/* Rule-Based Scoring Explanation */}
          {incident.priority_reasons && incident.priority_reasons.length > 0 && (
            <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80 space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Authoritative Scoring Rationale:
              </div>
              <ul className="text-xs text-slate-300 space-y-1">
                {incident.priority_reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-rose-400 font-bold">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            Dismiss Notification
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onAcknowledge(incident)}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Acknowledge SOS</span>
            </button>

            <button
              onClick={() => onViewIncident(incident)}
              className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-lg shadow-rose-900/30 transition flex items-center gap-1.5"
            >
              <span>View Incident in Operations</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
