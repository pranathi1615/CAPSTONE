import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Calendar, AlertCircle } from 'lucide-react';
import { createDoctorSlotApi } from './api';

export const AddSlotModal = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Default to today in 1 hour
  const defaultStart = new Date(Date.now() + 3600 * 1000);
  defaultStart.setMinutes(0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 30 * 60 * 1000);

  const formatForInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [slotStart, setSlotStart] = useState(formatForInput(defaultStart));
  const [slotEnd, setSlotEnd] = useState(formatForInput(defaultEnd));

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('doctor_dashboard.add_slot_title') || 'Add Availability Slot'}
              </h3>
              <p className="text-xs text-slate-500">
                {t('doctor_dashboard.add_slot_desc') || 'Define weekly or daily consulting hours'}
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

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
      </div>
    </div>
  );
};
