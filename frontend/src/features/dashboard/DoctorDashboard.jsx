import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Stethoscope,
  CheckCircle,
  AlertTriangle,
  Video,
  Users,
  Clock,
  Plus,
  PhoneCall,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getDoctorQueueApi, callPatientApi, getDoctorSlotsApi } from '../consultation/api';
import { AddSlotModal } from '../consultation/AddSlotModal';
import { DoctorEmergencyAlertBanner } from '../triage/DoctorEmergencyAlertBanner';
import { DoctorAsyncInbox } from '../triage/DoctorAsyncInbox';
import { ReferralNoteGeneratorModal } from '../triage/ReferralNoteGeneratorModal';
import { Inbox, FileText, AlertOctagon } from 'lucide-react';

export const DoctorDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'async' | 'slots'
  const [queue, setQueue] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [selectedPatientForReferral, setSelectedPatientForReferral] = useState(null);
  const [callingBookingId, setCallingBookingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [ws, setWs] = useState(null);

  // Live timer tick every second for real-time wait-time counter
  const [currentTime, setCurrentTime] = useState(Date.now());

  const isApproved = user?.doctor_status === 'approved';

  // Setup WebSocket connection for on-call emergency alerts
  useEffect(() => {
    if (!user || !isApproved) return;
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://${window.location.hostname}:8000/ws?token=${token}&room=doctor_alerts_${user.user_id}`;
    let socket;
    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        setWs(socket);
      };
      socket.onerror = (e) => console.log('Doctor alert WS error (handled):', e);
    } catch (e) {
      console.log('WS init error:', e);
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user, isApproved]);

  // 1. Fetch live queue
  const fetchQueue = async () => {
    if (!isApproved) return;
    try {
      const res = await getDoctorQueueApi();
      setQueue(res.data || []);
    } catch (err) {
      console.warn('Failed to load queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  // 2. Fetch doctor's availability slots
  const fetchSlots = async () => {
    if (!user || !isApproved) return;
    try {
      setLoadingSlots(true);
      const res = await getDoctorSlotsApi(user.user_id);
      setSlots(res.data || []);
    } catch (err) {
      console.warn('Failed to load slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetchSlots();

    // 1-second interval: updates wait duration display and polls queue updates
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    const queuePoll = setInterval(() => {
      fetchQueue();
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(queuePoll);
    };
  }, [isApproved, user]);

  // Format wait duration: MM:SS or Xm Ys
  const formatWaitDuration = (joinedAt) => {
    if (!joinedAt) return '00:00';
    const joined = new Date(joinedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((currentTime - joined) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  };

  // Doctor clicks Call button
  const handleCallPatient = async (booking) => {
    try {
      setCallingBookingId(booking.booking_id);
      setActionError('');
      const res = await callPatientApi(booking.booking_id);
      const roomId = res.data?.room_id || booking.consultation_room_id || booking.room_id;
      navigate(
        `/consultation/${roomId}?bookingId=${booking.booking_id}&patientId=${booking.patient_id}&patientName=${encodeURIComponent(booking.patient_name || 'Patient')}`
      );
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to start call with patient.');
      setCallingBookingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* On-Call WebSocket Emergency Alert Banner */}
      <DoctorEmergencyAlertBanner
        ws={ws}
        onSelectEmergency={(alert) => {
          fetchQueue();
          setActiveTab('queue');
        }}
      />

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 data-testid="doctor-dashboard-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {t('doctor_dashboard.welcome')}, {user?.full_name}
                </h2>
                {user?.is_on_call && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider">
                    On-Call
                  </span>
                )}
              </div>
              <p className="text-emerald-100 text-sm mt-0.5">
                {user?.specialty || 'General Practitioner'} • Reg No: {user?.registration_number || 'Pending'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isApproved && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(true)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-emerald-800 font-bold shadow-xs hover:bg-emerald-50 active:bg-emerald-100 transition-all text-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('doctor_dashboard.add_slot_btn') || 'Add Slot'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatientForReferral({ full_name: 'Patient Handover' });
                    setIsReferralModalOpen(true);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs transition-all text-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Referral Note</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Tab Navigation */}
      {isApproved && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Live Queue (Triage Sorted)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
              {queue.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('async')}
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'async'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Async Consultations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('slots')}
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'slots'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Availability Slots</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
              {slots.length}
            </span>
          </button>
        </div>
      )}

      {/* TAB 1: LIVE QUEUE */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {t('doctor_dashboard.live_queue_title') || 'Live Patient Waiting Queue'}
                </h3>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Sorted by <b>Clinical Urgency</b>, then arrival time (Urgent patients jump the queue)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
                {queue.length} {t('doctor_dashboard.waiting_count') || 'Waiting'}
              </span>
              <button
                type="button"
                onClick={fetchQueue}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Refresh queue"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isApproved ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Doctor registration must be approved by admin before receiving patients into the queue.
            </div>
          ) : loadingQueue && queue.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">{t('loading')}...</div>
          ) : queue.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">
                {t('doctor_dashboard.queue_empty') || 'No patients are currently in your waiting queue.'}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {queue.map((item, index) => {
                const urg = item.urgency || 'routine';
                const isEmergency = urg === 'emergency';
                const isUrgent = urg === 'urgent';
                return (
                  <div
                    key={item.booking_id}
                    data-testid={`queue-item-${item.booking_id}`}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isEmergency
                        ? 'border-rose-400 bg-rose-50/70 shadow-sm ring-1 ring-rose-400'
                        : isUrgent
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-emerald-50/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl font-black flex items-center justify-center text-sm shrink-0 ${
                        isEmergency
                          ? 'bg-rose-600 text-white'
                          : isUrgent
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        #{index + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                            {item.patient_name || 'Patient'}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isEmergency
                              ? 'bg-rose-600 text-white animate-pulse'
                              : isUrgent
                              ? 'bg-amber-500 text-white'
                              : urg === 'soon'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}>
                            {urg}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          <b>Reason:</b> {item.reason || 'General Teleconsultation'}
                        </p>
                        {item.urgency_reason && (
                          <p className="text-[11px] text-rose-700 font-semibold mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{item.urgency_reason}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      {/* Dynamic Wait Time */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-slate-800 font-mono text-xs font-bold border border-slate-200">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Wait: {formatWaitDuration(item.joined_waiting_at)}</span>
                      </div>

                      {/* Referral button if high urgency */}
                      {(isEmergency || isUrgent) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatientForReferral({
                              user_id: item.patient_id,
                              full_name: item.patient_name,
                            });
                            setIsReferralModalOpen(true);
                          }}
                          className="px-3 py-2 rounded-xl bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold cursor-pointer"
                        >
                          Referral Note
                        </button>
                      )}

                      {/* Call Button */}
                      <button
                        type="button"
                        onClick={() => handleCallPatient(item)}
                        disabled={callingBookingId === item.booking_id}
                        className={`min-h-[44px] px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                          isEmergency
                            ? 'bg-rose-600 hover:bg-rose-700'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        <PhoneCall className="w-4 h-4" />
                        {callingBookingId === item.booking_id ? 'Starting Call...' : 'Call Patient'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ASYNC CONSULTATIONS */}
      {activeTab === 'async' && (
        <DoctorAsyncInbox />
      )}

      {/* TAB 3: AVAILABILITY SLOTS */}
      {activeTab === 'slots' && isApproved && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('doctor_dashboard.slots_heading') || 'My Availability Slots'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Weekly scheduled slots bookable by patients
              </p>
            </div>
            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
              {slots.filter((s) => !s.is_booked).length} Open
            </span>
          </div>

          {loadingSlots ? (
            <div className="py-8 text-center text-slate-500 text-sm">{t('loading')}</div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              No slots configured yet. Click "Add Availability Slot" to make yourself bookable.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {slots.map((s) => {
                const start = new Date(s.slot_start);
                const end = new Date(s.slot_end);
                return (
                  <div
                    key={s.slot_id}
                    className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                      !s.is_booked
                        ? 'border-emerald-200 bg-emerald-50/30 text-emerald-950'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <div>
                      <span className="font-bold block">
                        {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-[11px] opacity-80">
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        !s.is_booked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {!s.is_booked ? 'Open' : 'Booked'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AddSlotModal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        onSuccess={() => {
          fetchSlots();
          fetchQueue();
        }}
      />

      <ReferralNoteGeneratorModal
        isOpen={isReferralModalOpen}
        onClose={() => setIsReferralModalOpen(false)}
        patient={selectedPatientForReferral}
      />
    </div>
  );
};
