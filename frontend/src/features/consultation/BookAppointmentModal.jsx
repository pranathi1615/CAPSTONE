import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, Clock, Stethoscope, AlertCircle, CheckCircle } from 'lucide-react';
import { getApprovedDoctorsApi, getDoctorSlotsApi, bookAppointmentApi } from './api';

export const BookAppointmentModal = ({ isOpen, onClose, onSuccess, patientId = null }) => {
  const { t } = useTranslation();
  const [specialty, setSpecialty] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch approved doctors
  useEffect(() => {
    if (!isOpen) return;

    const fetchDoctors = async () => {
      try {
        setLoadingDoctors(true);
        setError('');
        const res = await getApprovedDoctorsApi(specialty);
        const docs = res.data || [];
        setDoctors(docs);
        if (docs.length > 0) {
          setSelectedDoctor((prev) => (prev && docs.some((d) => d.user_id === prev.user_id) ? prev : docs[0]));
        } else {
          setSelectedDoctor(null);
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load approved doctors.');
      } finally {
        setLoadingDoctors(false);
      }
    };

    fetchDoctors();
  }, [isOpen, specialty]);

  // 2. Fetch slots when doctor is selected
  useEffect(() => {
    if (!selectedDoctor) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }

    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        setError('');
        const res = await getDoctorSlotsApi(selectedDoctor.user_id);
        // DoctorSlotResponse returns is_booked (false means available)
        const available = (res.data || []).filter((s) => !s.is_booked);
        setSlots(available);
        if (available.length > 0) {
          setSelectedSlot(available[0]);
        } else {
          setSelectedSlot(null);
        }
      } catch (err) {
        setError('Failed to load slots for selected doctor.');
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDoctor]);

  if (!isOpen) return null;

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedDoctor) {
      setError('Please select a doctor.');
      return;
    }
    if (!selectedSlot) {
      setError('Please select an appointment time slot.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await bookAppointmentApi({
        doctor_id: selectedDoctor.user_id,
        slot_start: selectedSlot.slot_start,
        slot_end: selectedSlot.slot_end,
        reason: reason.trim(),
        patient_id: patientId,
      });

      onSuccess();
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409) {
        setError('This time slot was just booked by another patient. Please choose another slot.');
      } else {
        setError(detail || 'Failed to book appointment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('appointments.book_title') || 'Book Telehealth Consultation'}
              </h3>
              <p className="text-xs text-slate-500">
                {t('appointments.book_desc') || 'Select an approved doctor and availability slot'}
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

        <form onSubmit={handleBook} className="mt-4 space-y-4">
          {/* Specialty Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('appointments.filter_specialty') || 'Filter by Specialty'}
            </label>
            <select
              value={specialty}
              onChange={(e) => {
                setSpecialty(e.target.value);
                setSelectedDoctor(null);
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500"
            >
              <option value="">{t('appointments.all_specialties') || 'All Specialties'}</option>
              <option value="General Medicine">General Medicine</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Dermatology">Dermatology</option>
              <option value="Gynecology">Gynecology</option>
            </select>
          </div>

          {/* Select Approved Doctor */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('appointments.select_doctor') || 'Select Approved Doctor *'}
            </label>
            {loadingDoctors ? (
              <div className="text-xs text-slate-500 py-2">{t('loading')}...</div>
            ) : doctors.length === 0 ? (
              <div className="text-xs text-slate-500 py-2 bg-slate-50 rounded-xl px-3 border border-slate-200">
                No approved doctors currently available for this specialty.
              </div>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {doctors.map((doc) => (
                  <div
                    key={doc.user_id}
                    onClick={() => setSelectedDoctor(doc)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between ${
                      selectedDoctor?.user_id === doc.user_id
                        ? 'border-sky-500 bg-sky-50/80 ring-2 ring-sky-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-sky-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{doc.full_name}</span>
                        <span className="text-[11px] text-slate-500">{doc.specialty} • Reg: {doc.registration_number}</span>
                      </div>
                    </div>
                    {selectedDoctor?.user_id === doc.user_id && (
                      <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Select Slot */}
          {selectedDoctor && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('appointments.select_slot') || 'Available Slot *'}
              </label>
              {loadingSlots ? (
                <div className="text-xs text-slate-500 py-2">{t('loading')}...</div>
              ) : slots.length === 0 ? (
                <div className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 border border-amber-200">
                  Doctor has no open availability slots scheduled right now.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {slots.map((slot) => {
                    const start = new Date(slot.slot_start);
                    const isSelected = selectedSlot?.slot_id === slot.slot_id;
                    return (
                      <button
                        type="button"
                        key={slot.slot_id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 text-emerald-900 font-bold'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {start.toLocaleDateString([], { month: 'short', day: 'numeric' })},{' '}
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Reason for Visit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('appointments.reason_label') || 'Reason for Visit (Symptoms / Complaint)'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fever, cough, follow-up..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Submit */}
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
              disabled={submitting || !selectedDoctor || !selectedSlot}
              className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-sm font-bold shadow-md shadow-sky-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? t('loading') : t('appointments.confirm_booking') || 'Confirm Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
