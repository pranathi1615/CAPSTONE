import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Plus, CheckCircle, Clock, Video, FileText, Ban } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getPatientConsentsApi, revokeConsentApi } from '../auth/api';
import { GrantConsentModal } from '../consent/GrantConsentModal';

export const PatientDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadConsents = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await getPatientConsentsApi(user.user_id);
      setConsents(res.data);
    } catch (err) {
      console.error('Failed to load consents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConsents();
  }, [user]);

  const handleRevoke = async (consentId) => {
    setActionError('');
    try {
      await revokeConsentApi(consentId);
      await loadConsents();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to revoke consent.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {t('patient_dashboard.welcome')}, {user?.full_name}!
        </h2>
        <p className="mt-2 text-sky-100 text-sm sm:text-base max-w-2xl">
          {t('patient_dashboard.subtitle')}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="min-h-[48px] inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-sky-700 font-bold shadow-xs hover:bg-sky-50 active:bg-sky-100 transition-all text-sm touch-manipulation cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            {t('patient_dashboard.grant_consent_btn')}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Consents Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('patient_dashboard.consents_heading')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {t('patient_dashboard.consents_desc')}
            </p>
          </div>
          <span className="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full text-xs font-semibold">
            {consents.filter((c) => c.is_active).length} {t('active')}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {t('loading')}
          </div>
        ) : consents.length === 0 ? (
          <div className="py-12 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{t('patient_dashboard.no_consents')}</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {consents.map((consent) => (
              <div
                key={consent.consent_id}
                className={`p-4 rounded-2xl border transition-all ${
                  consent.is_active
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {consent.is_active ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Ban className="w-5 h-5 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <span className="text-sm font-bold text-slate-900 capitalize block">
                        {consent.purpose.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium inline-block mt-0.5 ${
                          consent.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {consent.is_active ? t('active') : t('revoked')}
                      </span>
                    </div>
                  </div>

                  {consent.is_active && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(consent.consent_id)}
                      className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors"
                    >
                      {t('patient_dashboard.revoke_btn')}
                    </button>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('patient_dashboard.granted_by_label')}:</span>
                    <span className="font-medium text-slate-800 uppercase text-[10px]">
                      {consent.granted_by_role}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('patient_dashboard.granted_at_label')}:</span>
                    <span className="font-mono text-[11px]">
                      {new Date(consent.granted_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions (Phase 2 & Phase 4 Shells) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          {t('patient_dashboard.quick_actions')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl border border-sky-100 bg-sky-50/50 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                {t('patient_dashboard.consultation_shell')}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Real-time WebRTC consultation & doctor queue (Unlocked in Phase 2)
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                {t('patient_dashboard.records_shell')}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                E-prescriptions, FHIR timeline & verified pharmacy finder (Unlocked in Phase 4)
              </p>
            </div>
          </div>
        </div>
      </div>

      <GrantConsentModal
        patientId={user?.user_id}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadConsents}
      />
    </div>
  );
};
