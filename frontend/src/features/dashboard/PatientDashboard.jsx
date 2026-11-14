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
  Pill,
  MapPin,
  QrCode,
  Activity,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getPatientConsentsApi, revokeConsentApi } from '../auth/api';
import { GrantConsentModal } from '../consent/GrantConsentModal';
import { BookAppointmentModal } from '../consultation/BookAppointmentModal';
import { getMyAppointmentsApi, joinAppointmentApi, cancelAppointmentApi } from '../consultation/api';
import { ClinicalRecordsTimeline } from '../records/ClinicalRecordsTimeline';
import { PrescriptionViewerModal } from '../records/PrescriptionViewerModal';
import { PharmacyFinder } from '../records/PharmacyFinder';

export const PatientDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [consents, setConsents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingConsents, setLoadingConsents] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isPharmacyFinderOpen, setIsPharmacyFinderOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
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

  const loadPrescriptions = async () => {
    if (!user) return;
    try {
      setLoadingPrescriptions(true);
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const res = await fetch(`/api/prescriptions/patient/${user.user_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data);
      }
    } catch (err) {
      console.error('Failed to load prescriptions', err);
    } finally {
      setLoadingPrescriptions(false);
    }
  };

  useEffect(() => {
    loadConsents();
    loadAppointments();
    loadPrescriptions();
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
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {t('patient_dashboard.welcome')}, {user?.full_name}!
        </h2>
        <p className="mt-2 text-sky-100 text-sm sm:text-base max-w-2xl">
          {t('patient_dashboard.subtitle')}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="quick-book-btn"
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

          <button
            type="button"
            data-testid="header-pharmacy-finder-btn"
            onClick={() => setIsPharmacyFinderOpen(true)}
            className="min-h-[48px] inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600/40 hover:bg-emerald-600/50 text-white font-bold border border-emerald-300/30 transition-all text-sm touch-manipulation cursor-pointer"
          >
            <MapPin className="w-5 h-5" />
            <span>Find Verified Pharmacies</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Quick Navigation Tabs for E2E and Direct Access */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200">
        <button
          type="button"
          data-testid="tab-appointments-btn"
          onClick={() => {
            const el = document.getElementById('appointments-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-sky-500 hover:text-sky-600 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Video className="w-4 h-4 text-sky-600" />
          <span>{t('appointments.my_appointments_title') || 'Telehealth Consultations'}</span>
        </button>

        <button
          type="button"
          data-testid="tab-clinical-records-btn"
          onClick={() => {
            const el = document.getElementById('clinical-records-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Activity className="w-4 h-4 text-indigo-600" />
          <span>Clinical Records & Vitals (FHIR)</span>
        </button>

        <button
          type="button"
          data-testid="tab-prescriptions-btn"
          onClick={() => {
            const el = document.getElementById('prescriptions-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 transition flex items-center gap-1.5 cursor-pointer"
        >
          <Pill className="w-4 h-4 text-emerald-600" />
          <span>Digital Prescriptions (Ed25519)</span>
        </button>

        <button
          type="button"
          data-testid="tab-consents-btn"
          onClick={() => {
            const el = document.getElementById('consents-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:border-sky-500 hover:text-sky-600 transition flex items-center gap-1.5 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-sky-600" />
          <span>{t('nav.consents') || 'Consent Records'}</span>
        </button>
      </div>

      {/* SECTION 1: APPOINTMENTS & TELEHEALTH VISITS */}
      <div id="appointments-section" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Video className="w-5 h-5 text-sky-600" />
            {t('appointments.my_appointments_title') || 'Upcoming Telehealth Consultations'}
          </h3>
          <button
            type="button"
            onClick={loadAppointments}
            className="text-xs text-sky-600 font-semibold hover:underline"
          >
            {t('common.refresh') || 'Refresh'}
          </button>
        </div>

        {loadingAppointments ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            {t('appointments.loading')}
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
            <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{t('appointments.no_appointments')}</p>
            <button
              type="button"
              onClick={() => setIsBookModalOpen(true)}
              className="mt-3 text-xs font-bold text-sky-600 hover:text-sky-700"
            >
              + {t('appointments.book_now')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {appointments.map((appt) => {
              const isJoinable = ['booked', 'waiting', 'in_call'].includes(appt.status);
              const isCurrentlyJoining = joiningBookingId === appt.booking_id;
              return (
                <div
                  key={appt.booking_id}
                  data-testid="appointment-card"
                  className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between hover:border-sky-300 transition-colors bg-white shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{appt.doctor_name}</h4>
                        <p className="text-xs text-slate-500 font-medium">{appt.doctor_specialty}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusBadge(
                          appt.status
                        )}`}
                      >
                        {t(`appointments.status_${appt.status}`) || appt.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(appt.slot_start).toLocaleDateString()} •{' '}
                          {new Date(appt.slot_start).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {appt.reason && (
                        <p className="text-[11px] text-slate-500 italic mt-1">"{appt.reason}"</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isJoinable && (
                      <button
                        type="button"
                        data-testid="patient-join-call-btn"
                        disabled={isCurrentlyJoining}
                        onClick={() => handleJoinVisit(appt)}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition active:scale-98 shadow-sm cursor-pointer"
                      >
                        <PhoneCall className="w-4 h-4" />
                        <span>
                          {isCurrentlyJoining
                            ? t('appointments.joining') || 'Connecting...'
                            : appt.status === 'in_call'
                            ? t('appointments.rejoin_btn') || 'Return to Call'
                            : t('appointments.join_consultation_btn') || 'Join Consultation'}
                        </span>
                      </button>
                    )}

                    {appt.status === 'booked' && (
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(appt.booking_id)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-semibold transition cursor-pointer"
                        title={t('appointments.cancel')}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: CLINICAL RECORDS (FHIR R4 & OFFLINE SYNC) */}
      <div id="clinical-records-section">
        <ClinicalRecordsTimeline patientId={user?.user_id} canAdd={true} />
      </div>

      {/* SECTION 3: DIGITAL PRESCRIPTIONS (ED25519 & QR) */}
      <div id="prescriptions-section" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Pill className="w-5 h-5 text-indigo-600" />
              {t('prescriptions.my_prescriptions_title') || 'My Tamper-Proof Prescriptions'}
            </h3>
            <p className="text-xs text-slate-500">
              Ed25519 digitally signed by your verified doctor. Ready for single-use pharmacy dispensing.
            </p>
          </div>
          <button
            type="button"
            onClick={loadPrescriptions}
            className="text-xs text-sky-600 font-semibold hover:underline"
          >
            Refresh
          </button>
        </div>

        {loadingPrescriptions ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading prescriptions...</div>
        ) : prescriptions.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <Pill className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              No digital prescriptions have been issued for you yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prescriptions.map((rx) => (
              <div
                key={rx.prescription_id}
                data-testid="prescription-card"
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-indigo-300 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{rx.doctor_name}</h4>
                      {rx.signature_valid && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Ed25519 Signed ✓
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Reg: {rx.doctor_registration_number}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      rx.status === 'issued'
                        ? 'bg-blue-100 text-blue-800'
                        : rx.status === 'dispensed'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {rx.status}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    Medications ({rx.items?.length})
                  </span>
                  {rx.items?.slice(0, 3).map((it, idx) => (
                    <div key={idx} className="flex justify-between text-slate-700 font-medium text-[11px]">
                      <span>• {it.drug_name}</span>
                      <span className="text-slate-500">
                        {it.dose} ({it.frequency})
                      </span>
                    </div>
                  ))}
                  {rx.items?.length > 3 && (
                    <span className="text-[10px] text-sky-600 block">
                      +{rx.items.length - 3} more drugs
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[11px] text-slate-500">
                    Issued: {new Date(rx.issued_at).toLocaleDateString()}
                  </span>

                  <button
                    type="button"
                    data-testid={`view-rx-qr-${rx.prescription_id}`}
                    onClick={() => setSelectedPrescription(rx)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>View QR Code</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 4: CONSENTS */}
      <div id="consents-section" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            {t('patient_dashboard.active_consents')}
          </h3>
          <button
            type="button"
            onClick={() => setIsConsentModalOpen(true)}
            className="text-xs text-sky-600 font-semibold hover:underline"
          >
            + {t('consent_modal.title') || 'Grant Consent'}
          </button>
        </div>

        {loadingConsents ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {t('patient_dashboard.loading_consents')}
          </div>
        ) : consents.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-2xl">
            <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{t('patient_dashboard.no_consents')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {consents.map((consent) => (
              <div
                key={consent.consent_id}
                className={`rounded-2xl p-4 border transition-all ${
                  consent.revoked_at
                    ? 'bg-slate-50/60 border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900 capitalize text-sm">
                      {t(`consent.purpose_${consent.purpose}`) || consent.purpose}
                    </span>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      {consent.revoked_at ? (
                        <span className="text-rose-600 flex items-center gap-1">
                          <Ban className="w-3.5 h-3.5" />
                          {t('consent.status_revoked')}
                        </span>
                      ) : (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {t('consent.status_active')}
                        </span>
                      )}
                    </div>
                  </div>

                  {!consent.revoked_at && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(consent.consent_id)}
                      className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-colors"
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

      {/* Quick Actions Shortcuts */}
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

          <div
            data-testid="quick-medical-records-btn"
            onClick={() => {
              const el = document.getElementById('clinical-records-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3 cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                View Medical Records & Vitals (FHIR R4)
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Offline-first clinical log, sync outbox & Ed25519 e-prescriptions
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

      <PrescriptionViewerModal
        isOpen={Boolean(selectedPrescription)}
        prescription={selectedPrescription}
        onClose={() => setSelectedPrescription(null)}
        onOpenPharmacyFinder={() => setIsPharmacyFinderOpen(true)}
      />

      <PharmacyFinder
        isOpen={isPharmacyFinderOpen}
        onClose={() => setIsPharmacyFinderOpen(false)}
      />
    </div>
  );
};
