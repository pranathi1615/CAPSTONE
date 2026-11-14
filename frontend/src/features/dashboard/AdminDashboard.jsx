import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Stethoscope, CheckCircle, XCircle, RefreshCw, Link as ChainIcon, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  getPendingDoctorsApi,
  approveDoctorApi,
  getAuditLogsApi,
  verifyAuditChainApi,
} from '../auth/api';

export const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [chainStatus, setChainStatus] = useState(null);
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

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const res = await getAuditLogsApi(25);
      setAuditLogs(res.data);
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

  const handleApproveDoctor = async (doctorId) => {
    try {
      await approveDoctorApi(doctorId, true);
      setMsg(t('admin_dashboard.approved_msg'));
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
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
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
      </div>

      {msg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span>{msg}</span>
        </div>
      )}

      {/* Doctor Verification Approvals */}
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

      {/* Immutable Audit Log Chain Verification */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ChainIcon className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('admin_dashboard.audit_heading')}
              </h3>
              <p className="text-xs text-slate-500">
                Cryptographic SHA-256 hash chaining prevents tampering and forks
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
            <p className="mt-1 text-sm">
              {chainStatus.message || chainStatus.reason}
            </p>
          </div>
        )}

        {/* Recent Audit Entries Table */}
        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {t('admin_dashboard.recent_logs')}
          </h4>
          {loadingAudit ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              {t('loading')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold text-left">
                    <th className="px-3 py-2">Seq</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Actor Role</th>
                    <th className="px-3 py-2">Block Hash (SHA-256)</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.seq} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-purple-700">#{log.seq}</td>
                      <td className="px-3 py-2 font-sans font-semibold text-slate-800">
                        {log.event_type}
                      </td>
                      <td className="px-3 py-2 uppercase font-sans text-[11px] text-slate-600">
                        {log.actor_role}
                      </td>
                      <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]" title={log.hash}>
                        {log.hash.slice(0, 16)}...
                      </td>
                      <td className="px-3 py-2 text-slate-500">
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
  );
};
