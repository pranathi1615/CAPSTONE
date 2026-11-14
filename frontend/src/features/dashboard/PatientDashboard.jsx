import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Plus,
  CheckCircle,
  Clock,
  Video,
  FileText,
  Ban,
  Calendar,
  Stethoscope,
  PhoneCall,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getPatientConsentsApi, revokeConsentApi } from '../auth/api';
import { GrantConsentModal } from '../consent/GrantConsentModal';
import { BookAppointmentModal } from '../consultation/BookAppointmentModal';
import { getMyAppointmentsApi, joinAppointmentApi, cancelAppointmentApi } from '../consultation/api';

export const PatientDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [consents, setConsents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingConsents, setLoadingConsents] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [joiningBookingId, setJoiningBookingId] = useState(null);

  const loadConsents = async () => {
    if (!user) return;
    try {
      setLoadingConsents(true);
      const res = await getPatientConsentsApi(user.user_id);
      setConsents(res.data);
    } catch (err) {
      console.error('Failed to load consents', err);
    } finally {
      setLoadingConsents(false);
    }
  };

  const loadAppointments = async () => {
    if (!user) return;
    try {
      setLoadingAppointments(true);
      const res = await getMyAppointmentsApi();
      setAppointments(res.data || []);
    } catch (err) {
      console.error('Failed to load appointments', err);
    } finally {
      setLoadingAppointments(false);
    }
  };

  useEffect(() => {
    loadConsents();
    loadAppointments();
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

  const handleJoinVisit = async (booking) => {
    try {
      setJoiningBookingId(booking.booking_id);
      setActionError('');
      let roomId = booking.room_id || booking.consultation_room_id;
      // If currently 'booked', call join endpoint to change status to 'waiting' and enter doctor's live queue
      if (booking.status === 'booked') {
        const res = await joinAppointmentApi(booking.booking_id);
        if (res.data?.room_id) roomId = res.data.room_id;
      }
      navigate(`/consultation/${roomId}?bookingId=${booking.booking_id}`);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to join consultation room.');
    } finally {
      setJoiningBookingId(null);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm(t('appointments.confirm_cancel') || 'Are you sure you want to cancel this appointment?')) {
      return;
    }
    try {
      setActionError('');
      await cancelAppointmentApi(bookingId);
      await loadAppointments();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to cancel appointment.');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'waiting':
        return 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse';
      case 'in_call':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'completed':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-sky-100 text-sky-800 border-sky-300';
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
            onClick={() => setIsBookModalOpen(true)}
            className="min-h-[48px] inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-sky-700 font-bold shadow-xs hover:bg-sky-50 active:bg-sky-100 transition-all text-sm touch-manipulation cursor-pointer"
          >
            <Calendar className="w-5 h-5" />
            {t('appointments.book_consultation_btn') || 'Book Consultation'}
          </button>

          <button
            type="button"
            onClick={() => setIsConsentModalOpen(true)}
            className="min-h-[48px] inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-500/30 hover:bg-sky-500/40 text-white font-bold border border-sky-400/30 transition-all text-sm touch-manipulation cursor-pointer"
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

      {/* Consultations / Appointments Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('appointments.my_consultations') || 'My Telehealth Consultations'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {t('appointments.my_consultations_desc') || 'Join live visits with approved doctors or track appointment status'}
            </p>
          </div>
          <span className="px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full text-xs font-semibold">
            {appointments.filter((a) => ['booked', 'waiting', 'in_call'].includes(a.status)).length} Active
          </span>
        </div>

        {loadingAppointments ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {t('loading')}
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-12 text-center">
            <Video className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">
              {t('appointments.no_consultations') || 'No scheduled consultations yet.'}
            </p>
            <button
              type="button"
              onClick={() => setIsBookModalOpen(true)}
              className="mt-3 text-sky-600 hover:text-sky-700 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Book your first visit
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {appointments.map((appt) => {
              const start = new Date(appt.slot_start);
              const isActive = ['booked', 'waiting', 'in_call'].includes(appt.status);
              return (
                <div
                  key={appt.booking_id}
                  className={`p-5 rounded-2xl border transition-all ${
                    appt.status === 'in_call'
                      ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-300'
                      : appt.status === 'waiting'
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                        <Stethoscope className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {appt.doctor_name || 'Assigned Doctor'}
                        </h4>
                        <span className="text-xs text-slate-500 block">
                          {appt.doctor_specialty || 'General Practitioner'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${getStatusBadge(
                        appt.status
                      )}`}
                    >
                      {appt.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-700">
                        {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {appt.reason && (
                      <p className="text-slate-500 italic">
                        "{appt.reason}"
                      </p>
                    )}
                  </div>

                  {isActive && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleJoinVisit(appt)}
                        disabled={joiningBookingId === appt.booking_id}
                        className="flex-1 min-h-[44px] px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                      >
                        <Video className="w-4 h-4" />
                        {appt.status === 'in_call'
                          ? 'Rejoin In-Progress Call'
                          : appt.status === 'waiting'
                          ? 'Return to Waiting Room'
                          : 'Join Consultation (Enter Queue)'}
                      </button>

                      {appt.status === 'booked' && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(appt.booking_id)}
                          className="min-h-[44px] px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                          title="Cancel Appointment"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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

        {loadingConsents ? (
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
                      className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer"
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

      {/* Quick Actions */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-4">
          {t('patient_dashboard.quick_actions')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => setIsBookModalOpen(true)}
            className="p-5 rounded-2xl border border-sky-100 bg-sky-50/50 flex items-start gap-3 cursor-pointer hover:bg-sky-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                {t('patient_dashboard.consultation_shell')}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Real-time WebRTC consultation & doctor queue
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
                E-prescriptions, FHIR timeline & verified pharmacy finder (Phase 4)
              </p>
            </div>
          </div>
        </div>
      </div>

      <GrantConsentModal
        patientId={user?.user_id}
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onSuccess={loadConsents}
      />

      <BookAppointmentModal
        patientId={user?.user_id}
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        onSuccess={loadAppointments}
      />
    </div>
  );
};
