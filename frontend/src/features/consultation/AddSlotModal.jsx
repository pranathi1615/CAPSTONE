import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Calendar, AlertCircle, Repeat, CheckCircle } from 'lucide-react';
import { createDoctorSlotApi, createRecurringSlotsApi } from './api';

const DAYS_OF_WEEK = [
  { id: 0, label: 'Mon' },
  { id: 1, label: 'Tue' },
  { id: 2, label: 'Wed' },
  { id: 3, label: 'Thu' },
  { id: 4, label: 'Fri' },
  { id: 5, label: 'Sat' },
  { id: 6, label: 'Sun' },
];

export const AddSlotModal = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('single'); // 'single' | 'recurring'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  // Single slot state
  const defaultStart = new Date(Date.now() + 3600 * 1000);
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 30 * 60 * 1000);

  const formatForInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [slotStart, setSlotStart] = useState(formatForInput(defaultStart));
  const [slotEnd, setSlotEnd] = useState(formatForInput(defaultEnd));

  // Recurring weekly slots state
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]); // Mon-Fri by default
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [slotDuration, setSlotDuration] = useState(30);
  const [weeksCount, setWeeksCount] = useState(2);

  if (!isOpen) return null;

  const toggleDay = (dayId) => {
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId].sort()
    );
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    const startIso = new Date(slotStart).toISOString();
    const endIso = new Date(slotEnd).toISOString();

    if (new Date(slotEnd) <= new Date(slotStart)) {
      setError('Slot end time must be after start time.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await createDoctorSlotApi(startIso, endIso);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create availability slot.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecurringSubmit = async (e) => {
    e.preventDefault();
    if (selectedDays.length === 0) {
      setError('Please select at least one day of the week.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await createRecurringSlotsApi({
        days_of_week: selectedDays,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: Number(slotDuration),
        weeks_count: Number(weeksCount),
      });

      const count = res.data?.length || 0;
      setSuccessInfo(`Successfully created ${count} recurring slots!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create recurring slots.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('doctor_dashboard.add_slot_title') || 'Doctor Availability'}
              </h3>
              <p className="text-xs text-slate-500">
                {t('doctor_dashboard.add_slot_desc') || 'Define weekly recurring or single consulting hours'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-slate-400 hover:text-slate-600 rounded-xl p-2 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 mt-4">
          <button
            type="button"
            onClick={() => {
              setTab('single');
              setError('');
            }}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition cursor-pointer ${
              tab === 'single'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            Single Slot
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('recurring');
              setError('');
            }}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition cursor-pointer ${
              tab === 'recurring'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Repeat className="w-4 h-4" />
            Weekly Recurring Schedule
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successInfo && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successInfo}</span>
          </div>
        )}

        {/* Tab 1: Single Slot Form */}
        {tab === 'single' && (
          <form onSubmit={handleSingleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('doctor_dashboard.slot_start') || 'Slot Start Time'}
              </label>
              <input
                type="datetime-local"
                value={slotStart}
                onChange={(e) => setSlotStart(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('doctor_dashboard.slot_end') || 'Slot End Time'}
              </label>
              <input
                type="datetime-local"
                value={slotEnd}
                onChange={(e) => setSlotEnd(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? t('loading') : t('doctor_dashboard.create_slot_btn') || 'Create Slot'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Weekly Recurring Schedule Form */}
        {tab === 'recurring' && (
          <form onSubmit={handleRecurringSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Repeat On Days of Week *
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = selectedDays.includes(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleDay(d.id)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Time (Daily)
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  End Time (Daily)
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Slot Duration
                </label>
                <select
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Schedule Ahead
                </label>
                <select
                  value={weeksCount}
                  onChange={(e) => setWeeksCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={1}>1 Week</option>
                  <option value={2}>2 Weeks</option>
                  <option value={4}>4 Weeks</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? t('loading') : 'Generate Weekly Slots'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
