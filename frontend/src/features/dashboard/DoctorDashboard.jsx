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

export const DoctorDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [callingBookingId, setCallingBookingId] = useState(null);
  const [actionError, setActionError] = useState('');

  // Live timer tick every second for real-time wait-time counter
  const [currentTime, setCurrentTime] = useState(Date.now());

  const isApproved = user?.doctor_status === 'approved';

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
      navigate(`/consultation/${roomId}?bookingId=${booking.booking_id}`);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to start call with patient.');
      setCallingBookingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {t('doctor_dashboard.welcome')}, {user?.full_name}
              </h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                {user?.specialty || 'General Practitioner'} • Reg No: {user?.registration_number || 'Pending'}
              </p>
            </div>
          </div>

          {isApproved && (
            <button
              type="button"
              onClick={() => setIsSlotModalOpen(true)}
              className="min-h-[48px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-emerald-800 font-bold shadow-xs hover:bg-emerald-50 active:bg-emerald-100 transition-all text-sm cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-5 h-5" />
              {t('doctor_dashboard.add_slot_btn') || 'Add Availability Slot'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Verification Status Card */}
      <div
        className={`rounded-3xl p-6 border shadow-xs transition-all ${
          isApproved
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-300'
        }`}
      >
        <div className="flex items-start gap-3">
          {isApproved ? (
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {t('doctor_dashboard.verification_notice')}
              </h3>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  isApproved
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                {isApproved ? t('approved') : t('pending')}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {isApproved
                ? t('doctor_dashboard.status_approved_msg')
                : t('doctor_dashboard.status_pending_msg')}
            </p>
          </div>
        </div>
      </div>

      {/* Live Doctor Queue (Phase 2 Requirement 4) */}
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
              Patients currently waiting to be called, ordered by arrival time (Wait times update live every second)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-bold">
              {queue.length} {t('doctor_dashboard.waiting_count') || 'Waiting'}
            </span>
            <button
              type="button"
              onClick={fetchQueue}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
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
            {queue.map((item, index) => (
              <div
                key={item.booking_id}
                className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-sm shrink-0">
                    #{index + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                      {item.patient_name || 'Patient'}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Reason: {item.reason || 'General Teleconsultation'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  {/* Dynamic Wait Time updating every second */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/70 text-amber-900 font-mono text-xs font-bold border border-amber-200">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>Wait: {formatWaitDuration(item.joined_waiting_at)}</span>
                  </div>

                  {/* Call Button */}
                  <button
                    type="button"
                    onClick={() => handleCallPatient(item)}
                    disabled={callingBookingId === item.booking_id}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <PhoneCall className="w-4 h-4" />
                    {callingBookingId === item.booking_id ? 'Starting Call...' : 'Call Patient'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Availability Slots Section */}
      {isApproved && (
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
              {slots.filter((s) => s.is_available).length} Open
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
                      s.is_available
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
                        s.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {s.is_available ? 'Open' : 'Booked'}
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
    </div>
  );
};
