import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  FileCheck2,
  FileText,
  HeartPulse,
  Mic,
  Network,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Users,
  Video,
  Wifi,
  WifiOff
} from 'lucide-react';
import { getAnalyticsSummaryApi } from './api';

export const AnalyticsDashboard = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getAnalyticsSummaryApi();
      setData(res.data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load analytics summary:', err);
      setError(err.response?.data?.detail || 'Failed to load platform analytics telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200">
        <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mb-3" />
        <p className="text-slate-600 font-medium text-sm">{t('loading') || 'Loading telemetry analytics...'}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-800">
        <div className="flex items-center gap-2 font-bold mb-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <span>Analytics Telemetry Error</span>
        </div>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition"
        >
          {t('retry') || 'Retry'}
        </button>
      </div>
    );
  }

  const { consultations, network, offline_sync, clinical, system_integrity } = data || {};

  // Specialty percentage calculations
  const totalConsults = consultations?.total || 1;
  const specialtyEntries = Object.entries(consultations?.by_specialty || {});

  // Urgency colors and configuration
  const urgencyColors = {
    emergency: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500', border: 'border-rose-200', label: 'Emergency (Red Flag)' },
    urgent: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', border: 'border-amber-200', label: 'Urgent' },
    soon: { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500', border: 'border-sky-200', label: 'Soon' },
    routine: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', border: 'border-emerald-200', label: 'Routine' },
  };

  // Mode distributions
  const modeConfigs = {
    VIDEO: { label: 'High Bandwidth Video', icon: Video, color: 'text-sky-600', bar: 'bg-sky-500' },
    AUDIO_ONLY: { label: 'Low Bandwidth Audio', icon: Wifi, color: 'text-indigo-600', bar: 'bg-indigo-500' },
    VOICE_NOTE: { label: 'Asynchronous Voice Notes', icon: Mic, color: 'text-amber-600', bar: 'bg-amber-500' },
    TEXT: { label: 'Ultra-low Bandwidth Text', icon: FileText, color: 'text-emerald-600', bar: 'bg-emerald-500' },
  };

  const totalModeEvents = Object.values(network?.mode_distribution || {}).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-6" data-testid="analytics-dashboard">
      {/* Header bar with Refresh Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-sky-600" />
            <span>Platform Telemetry & Public Health Analytics</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Aggregated epidemiological trends, weak-network resilience, and clinical operational metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[11px] font-mono text-slate-400">
              Updated: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top 4 Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Consultations */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Consultations</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{consultations?.total}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Active across all primary specialties</span>
          </div>
        </div>

        {/* KPI 2: Average Patient Wait Time */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Wait Time</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{consultations?.avg_wait_time_formatted}</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-purple-600">
            <Activity className="w-3.5 h-3.5" />
            <span>Live arrival queue tracking</span>
          </div>
        </div>

        {/* KPI 3: Network Resilience Rate */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Network Resilience</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Network className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700">{network?.resilience_rate_percent}%</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-slate-500">
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span>Zero disconnect session degradation</span>
          </div>
        </div>

        {/* KPI 4: Offline Sync Idempotency */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Offline Sync Idempotency</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{offline_sync?.conflict_resolution_rate_percent}%</div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-amber-600">
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>{offline_sync?.total_sync_receipts} mutations synchronized</span>
          </div>
        </div>
      </div>

      {/* Row 2: Specialty Breakdown & Triage Urgency Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Specialty Breakdown */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-sky-600" />
              <h4 className="font-bold text-slate-900 text-base">Consultations by Medical Specialty</h4>
            </div>
            <span className="text-xs font-semibold text-slate-500">{specialtyEntries.length} Specialties</span>
          </div>

          <div className="space-y-4">
            {specialtyEntries.map(([spec, count]) => {
              const pct = Math.round((count / totalConsults) * 100);
              return (
                <div key={spec}>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-800">{spec}</span>
                    <span className="text-slate-500 font-mono">{count} visits ({pct}%)</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Triage Urgency Distribution */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h4 className="font-bold text-slate-900 text-base">Triage Acuity & Urgency Distribution</h4>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              {clinical?.red_flags_detected || 0} Red Flags
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(consultations?.by_urgency || {}).map(([urgency, count]) => {
              const conf = urgencyColors[urgency] || urgencyColors.routine;
              return (
                <div key={urgency} className={`p-3 rounded-2xl border ${conf.border} ${conf.bg}`}>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${conf.text}`}>
                    {conf.label}
                  </span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">{count}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {Math.round((count / totalConsults) * 100)}% of caseload
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span className="font-medium">Total Triage Model Assessments:</span>
            <span className="font-mono font-bold text-slate-900">{clinical?.triage_evaluations_total}</span>
          </div>
        </div>
      </div>

      {/* Row 3: Weak Network Degradation & Clinical Interventions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weak Network Mode Degradation */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <WifiOff className="w-5 h-5 text-indigo-600" />
              <h4 className="font-bold text-slate-900 text-base">Network Mode Adaptive Degradation</h4>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {network?.mode_events_count} Transitions Handled
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            CareBridge automatically transitions modes with hysteresis to sustain consultations over unstable rural connections:
          </p>

          <div className="space-y-3.5">
            {Object.entries(network?.mode_distribution || {}).map(([mode, count]) => {
              const conf = modeConfigs[mode] || { label: mode, icon: Activity, color: 'text-slate-600', bar: 'bg-slate-400' };
              const Icon = conf.icon;
              const pct = Math.round((count / totalModeEvents) * 100);
              return (
                <div key={mode} className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${conf.color}`} />
                      <span className="text-xs font-bold text-slate-800">{conf.label}</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-600">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden">
                    <div className={`h-full ${conf.bar} rounded-full transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clinical Operations & Interventions */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h4 className="font-bold text-slate-900 text-base">Clinical Interventions & Prescriptions</h4>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Ed25519 Verified
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Prescriptions Issued</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{clinical?.prescriptions_issued}</div>
              <span className="text-[11px] text-emerald-600 font-medium">
                {clinical?.prescriptions_dispensed} dispensed at pharmacies
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Referral Notes Generated</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{clinical?.referrals_generated}</div>
              <span className="text-[11px] text-slate-500 font-medium">Standard PDF documents</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">CHW Follow-ups Active</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{clinical?.followups_active}</div>
              <span className="text-[11px] text-emerald-600 font-medium">
                {clinical?.followups_completed} completed
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">Async Consults Handled</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{clinical?.async_consults_total}</div>
              <span className="text-[11px] text-purple-600 font-medium">24h triage turnaround</span>
            </div>
          </div>

          {/* Audit Chain Telemetry Pill */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-700" />
              <span className="font-semibold text-purple-900">Cryptographic Audit Chain:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-purple-800 font-bold">#{system_integrity?.tip_seq} blocks</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                {system_integrity?.audit_chain_status}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
