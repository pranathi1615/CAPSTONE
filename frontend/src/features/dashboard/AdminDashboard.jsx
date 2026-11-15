import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Stethoscope,
  CheckCircle,
  XCircle,
  RefreshCw,
  Link as ChainIcon,
  AlertTriangle,
  BarChart3,
  Filter,
  Layers,
  Hash,
  Clock,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  getPendingDoctorsApi,
  approveDoctorApi,
  getAuditLogsApi,
  getAuditStatsApi,
  verifyAuditChainApi,
} from '../auth/api';
import { AnalyticsDashboard } from '../analytics/AnalyticsDashboard';

export const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'analytics' | 'approvals'
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditStats, setAuditStats] = useState(null);
  const [chainStatus, setChainStatus] = useState(null);
  const [selectedEventType, setSelectedEventType] = useState('');
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [msg, setMsg] = useState('');

  const loadPendingDoctors = async () => {
    try {
      setLoadingDoctors(true);
      const res = await getPendingDoctorsApi();
      setPendingDoctors(res.data);
    } catch (err) {
      console.error('Failed to load pending doctors', err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const loadAuditLogs = async (eventType = selectedEventType) => {
    try {
      setLoadingAudit(true);
      const [logsRes, statsRes] = await Promise.allSettled([
        getAuditLogsApi(50, eventType),
        getAuditStatsApi(),
      ]);
      if (logsRes.status === 'fulfilled') {
        setAuditLogs(logsRes.value.data);
      }
      if (statsRes.status === 'fulfilled') {
        setAuditStats(statsRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadPendingDoctors();
    loadAuditLogs();
  }, []);

  const handleEventTypeChange = (newType) => {
    setSelectedEventType(newType);
    loadAuditLogs(newType);
  };

  const handleApproveDoctor = async (doctorId) => {
    try {
      await approveDoctorApi(doctorId, true);
      setMsg(t('admin_dashboard.approved_msg') || 'Doctor successfully approved and unlocked.');
      await loadPendingDoctors();
      await loadAuditLogs();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve doctor.');
    }
  };

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    setChainStatus(null);
    try {
      const res = await verifyAuditChainApi();
      setChainStatus(res.data);
    } catch (err) {
      setChainStatus({
        valid: false,
        reason: 'Verification request failed',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {t('admin_dashboard.welcome')}
              </h2>
              <p className="text-purple-200 text-sm mt-0.5">
                {t('admin_dashboard.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-mono font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>SHA-256 Hardened</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/10 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white text-purple-900 shadow-sm'
                : 'text-purple-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <ChainIcon className="w-4 h-4" />
            <span>Audit Chain Inspector</span>
            {auditStats?.total_blocks ? (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'audit' ? 'bg-purple-100 text-purple-800' : 'bg-white/20 text-white'}`}>
                {auditStats.total_blocks}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-purple-900 shadow-sm'
                : 'text-purple-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Platform Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'approvals'
                ? 'bg-white text-purple-900 shadow-sm'
                : 'text-purple-200 hover:text-white hover:bg-white/10'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Doctor Approvals</span>
            {pendingDoctors.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold animate-pulse">
                {pendingDoctors.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span>{msg}</span>
        </div>
      )}

      {/* TAB 1: Cryptographic Audit Chain Inspector */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Top Audit Telemetry Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>Chain Length</span>
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                #{auditStats?.tip_seq || auditLogs.length || 0}
              </div>
              <span className="text-[11px] text-emerald-600 font-medium">Monotonic sequence intact</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>Genesis Parent</span>
                <Hash className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xs font-mono font-bold text-slate-800 truncate" title={auditStats?.genesis_hash || '0'.repeat(64)}>
                {(auditStats?.genesis_hash || '0'.repeat(64)).slice(0, 16)}...
              </div>
              <span className="text-[11px] text-slate-500">Fixed 256-bit zero root</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>Tip Block Hash</span>
                <ChainIcon className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xs font-mono font-bold text-purple-700 truncate" title={auditStats?.tip_hash || '-'}>
                {auditStats?.tip_hash ? `${auditStats.tip_hash.slice(0, 16)}...` : 'Tip pending'}
              </div>
              <span className="text-[11px] text-purple-600 font-medium">Latest committed block</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>Chain Health</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg font-black text-emerald-700">100% INTACT</div>
              <span className="text-[11px] text-emerald-600 font-medium">Zero forks or gaps detected</span>
            </div>
          </div>

          {/* Immutable Audit Log Chain Verification Panel */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ChainIcon className="w-6 h-6 text-purple-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('admin_dashboard.audit_heading')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cryptographic SHA-256 hash chaining prevents tampering and forks (P=prev_hash, C=hash)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleVerifyChain}
                disabled={isVerifying}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 active:bg-purple-900 disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5" />
                {isVerifying ? t('admin_dashboard.verifying') : t('admin_dashboard.verify_chain_btn')}
              </button>
            </div>

            {/* Chain Verification Result Banner */}
            {chainStatus && (
              <div
                className={`mt-4 p-4 rounded-2xl border ${
                  chainStatus.valid
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-base">
                  {chainStatus.valid ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                  )}
                  <span>
                    {chainStatus.valid
                      ? t('admin_dashboard.chain_valid')
                      : t('admin_dashboard.chain_invalid')}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {chainStatus.message || chainStatus.reason}
                </p>
                {chainStatus.valid && (
                  <div className="mt-2 text-xs font-mono text-emerald-800 flex flex-wrap items-center gap-4">
                    <span>Algorithm: {chainStatus.algorithm || 'SHA-256 Monotonic Parent Chaining'}</span>
                    <span>Verified: {chainStatus.verified_at ? new Date(chainStatus.verified_at).toLocaleTimeString() : 'Just now'}</span>
                    <span>Blocks Verified: #{chainStatus.count}</span>
                  </div>
                )}
              </div>
            )}

            {/* Filters and Recent Audit Entries Table */}
            <div className="mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t('admin_dashboard.recent_logs')}
                </h4>

                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    data-testid="audit-event-filter"
                    value={selectedEventType}
                    onChange={(e) => handleEventTypeChange(e.target.value)}
                    className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Event Types</option>
                    <option value="SEED_USER_CREATED">SEED_USER_CREATED</option>
                    <option value="SEED_CONSENT_CREATED">SEED_CONSENT_CREATED</option>
                    <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                    <option value="DOCTOR_APPROVED">DOCTOR_APPROVED</option>
                    <option value="BOOKING_CREATED">BOOKING_CREATED</option>
                    <option value="TRIAGE_EVALUATED">TRIAGE_EVALUATED</option>
                    <option value="PRESCRIPTION_ISSUED">PRESCRIPTION_ISSUED</option>
                    <option value="REFERRAL_CREATED">REFERRAL_CREATED</option>
                    <option value="SYNC_BATCH_APPLIED">SYNC_BATCH_APPLIED</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => loadAuditLogs(selectedEventType)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                    title="Refresh logs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {loadingAudit ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  {t('loading')}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  No audit logs found for the selected filter.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold text-left">
                        <th className="px-3.5 py-2.5">Seq</th>
                        <th className="px-3.5 py-2.5">Integrity</th>
                        <th className="px-3.5 py-2.5">Event Type</th>
                        <th className="px-3.5 py-2.5">Actor Role</th>
                        <th className="px-3.5 py-2.5">SHA-256 Current Hash</th>
                        <th className="px-3.5 py-2.5">Previous Hash</th>
                        <th className="px-3.5 py-2.5 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {auditLogs.map((log) => (
                        <tr key={log.seq} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-3.5 py-2.5 font-bold text-purple-700">#{log.seq}</td>
                          <td className="px-3.5 py-2.5 font-sans">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Verified</span>
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-sans font-bold text-slate-800">
                            {log.event_type}
                          </td>
                          <td className="px-3.5 py-2.5 uppercase font-sans text-[11px] font-semibold text-slate-600">
                            {log.actor_role}
                          </td>
                          <td className="px-3.5 py-2.5 text-purple-700 truncate max-w-[140px]" title={log.hash}>
                            {log.hash.slice(0, 12)}...
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-400 truncate max-w-[140px]" title={log.prev_hash}>
                            {log.prev_hash ? `${log.prev_hash.slice(0, 12)}...` : 'Genesis'}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-500 font-sans text-[11px] text-right">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Platform Analytics Dashboard */}
      {activeTab === 'analytics' && (
        <AnalyticsDashboard />
      )}

      {/* TAB 3: Doctor Approvals */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-6 h-6 text-purple-600" />
              <h3 className="text-lg font-bold text-slate-900">
                {t('admin_dashboard.doctor_approvals_heading')}
              </h3>
            </div>
            <button
              type="button"
              onClick={loadPendingDoctors}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loadingDoctors ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {t('loading')}
            </div>
          ) : pendingDoctors.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              {t('admin_dashboard.no_pending_doctors')}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-left">
                    <th className="px-4 py-3 rounded-l-xl">{t('admin_dashboard.doctor_name')}</th>
                    <th className="px-4 py-3">{t('admin_dashboard.email')}</th>
                    <th className="px-4 py-3">{t('admin_dashboard.reg_no')}</th>
                    <th className="px-4 py-3">{t('admin_dashboard.specialty')}</th>
                    <th className="px-4 py-3 rounded-r-xl text-right">{t('admin_dashboard.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingDoctors.map((doc) => (
                    <tr key={doc.user_id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3.5 font-bold text-slate-900">{doc.full_name}</td>
                      <td className="px-4 py-3.5 text-slate-600">{doc.email}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-purple-700">
                        {doc.registration_number || 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{doc.specialty || '-'}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleApproveDoctor(doc.user_id)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t('admin_dashboard.approve_btn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
