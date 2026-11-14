import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, UserPlus, ShieldCheck, CheckCircle2, WifiOff, Calendar } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { grantConsentApi } from '../auth/api';
import { BookAppointmentModal } from '../consultation/BookAppointmentModal';

export const ChwDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [patientId, setPatientId] = useState('');
  const [purpose, setPurpose] = useState('teleconsultation');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CHW Assisted Booking Modal
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [assistedPatientId, setAssistedPatientId] = useState('');

  const handleRecordConsent = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);

    try {
      await grantConsentApi(patientId.trim(), purpose);
      setStatusMsg(t('chw_dashboard.consent_success'));
      setPatientId('');
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to record consent on behalf of patient.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAssistedBooking = (e) => {
    e.preventDefault();
    if (!assistedPatientId.trim()) return;
    setIsBookModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
            <HeartHandshake className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('chw_dashboard.welcome')}
            </h2>
            <p className="text-amber-100 text-sm mt-0.5">
              {user?.full_name} • Community Health Worker Portal
            </p>
          </div>
        </div>
      </div>

      {/* Book Consultation on Behalf of Patient Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Calendar className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('chw_dashboard.book_on_behalf_heading') || 'Assisted Telehealth Consultation Booking'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Schedule an appointment with an approved doctor on behalf of a rural patient
            </p>
          </div>
        </div>

        <form onSubmit={handleOpenAssistedBooking} className="mt-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t('chw_dashboard.patient_id_label')} *
            </label>
            <input
              type="text"
              required
              value={assistedPatientId}
              onChange={(e) => setAssistedPatientId(e.target.value)}
              placeholder="e.g. 023ee6e2-d28a-495a-9bc0-d0c5ad668369"
              className="block w-full px-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-900 text-sm font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 active:bg-amber-800 transition-colors shadow-xs text-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            {t('chw_dashboard.open_booking_modal_btn') || 'Select Doctor & Book Slot'}
          </button>
        </form>
      </div>

      {/* Record Consent on Behalf of Patient Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <ShieldCheck className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('chw_dashboard.record_consent_heading')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              {t('chw_dashboard.subtitle')}
            </p>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleRecordConsent} className="mt-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t('chw_dashboard.patient_id_label')} *
            </label>
            <input
              type="text"
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="e.g. 023ee6e2-d28a-495a-9bc0-d0c5ad668369"
              className="block w-full px-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-900 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t('chw_dashboard.purpose_label')}
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="block w-full px-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-slate-900 text-sm bg-white"
            >
              <option value="teleconsultation">{t('consent_modal.teleconsultation')}</option>
              <option value="medical_record_sharing">{t('consent_modal.records_sharing')}</option>
              <option value="emergency_triage">{t('consent_modal.emergency_triage')}</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 transition-colors shadow-xs text-sm cursor-pointer"
          >
            {isSubmitting ? t('loading') : t('chw_dashboard.record_consent_btn')}
          </button>
        </form>
      </div>

      {/* Field Tools Shell (Phase 5 Preview) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          {t('chw_dashboard.field_tools')}
        </h3>
        <div className="p-5 rounded-2xl border border-amber-100 bg-amber-50/40 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              {t('chw_dashboard.assisted_visit_shell')}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Offline-first visit mode, vitals capture, voice notes & Dexie IndexedDB sync (Unlocked in Phase 5)
            </p>
          </div>
        </div>
      </div>

      <BookAppointmentModal
        patientId={assistedPatientId.trim()}
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        onSuccess={() => {
          setStatusMsg('Consultation booked successfully on behalf of patient!');
        }}
      />
    </div>
  );
};
