import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HeartHandshake,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Activity,
  HeartPulse,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { grantConsentApi } from '../auth/api';
import { BookAppointmentModal } from '../consultation/BookAppointmentModal';
import { OfflineSyncBanner } from '../sync/OfflineSyncBanner';
import { AssistedVisitFlow } from '../chw/AssistedVisitFlow';
import { InactivityLockModal } from '../chw/InactivityLockModal';
import { ChwFollowupsDueToday } from '../triage/ChwFollowupsDueToday';
import { CalendarCheck } from 'lucide-react';

export const ChwDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('assisted_visit'); // 'assisted_visit' | 'followups' | 'booking' | 'consent'

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
      {/* Real-time 4-State Offline & Sync Status Banner */}
      <OfflineSyncBanner />

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <div>
              <h2 data-testid="chw-dashboard-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {t('chw_dashboard.welcome')}
              </h2>
              <p className="text-amber-100 text-sm mt-0.5">
                {user?.full_name} • Community Health Worker Field Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-amber-900/30 p-1.5 rounded-2xl border border-white/10">
            <button
              type="button"
              data-testid="tab-assisted-visit"
              onClick={() => setActiveTab('assisted_visit')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'assisted_visit'
                  ? 'bg-white text-amber-900 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Assisted Visit</span>
            </button>

            <button
              type="button"
              data-testid="tab-followups"
              onClick={() => setActiveTab('followups')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'followups'
                  ? 'bg-white text-amber-900 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Follow-ups Due Today</span>
            </button>

            <button
              type="button"
              data-testid="tab-booking"
              onClick={() => setActiveTab('booking')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'booking'
                  ? 'bg-white text-amber-900 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Appointment</span>
            </button>

            <button
              type="button"
              data-testid="tab-consent"
              onClick={() => setActiveTab('consent')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'consent'
                  ? 'bg-white text-amber-900 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Standalone Consent</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'assisted_visit' && (
        <section data-testid="assisted-visit-section">
          <AssistedVisitFlow chwUser={user} />
        </section>
      )}

      {/* Follow-ups Due Today Tab (Phase 6 Requirement 7) */}
      {activeTab === 'followups' && (
        <section data-testid="chw-followups-section">
          <ChwFollowupsDueToday />
        </section>
      )}

      {/* Book Consultation on Behalf of Patient Card */}
      {activeTab === 'booking' && (
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
      )}

      {/* Record Consent on Behalf of Patient Card */}
      {activeTab === 'consent' && (
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
      )}

      <BookAppointmentModal
        patientId={assistedPatientId.trim()}
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        onSuccess={() => {
          setStatusMsg('Consultation booked successfully on behalf of patient!');
        }}
      />

      {/* Shared-Device Safety: 5-minute Inactivity Screen Lock & Manual Lock */}
      <InactivityLockModal inactivityTimeoutMs={5 * 60 * 1000} />
    </div>
  );
};
