import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, X, AlertCircle, CheckCircle, Hospital, ShieldAlert } from 'lucide-react';
import cachedFacilities from './emergency_facilities.json';
import { generateReferralApi } from './api';

export const ReferralNoteGeneratorModal = ({ isOpen, onClose, patient, initialVitals = {} }) => {
  const { t } = useTranslation();
  const [facilityId, setFacilityId] = useState(cachedFacilities.facilities[0]?.id || 'MOCK-HOSP-01');
  const [urgency, setUrgency] = useState('emergency');
  const [summary, setSummary] = useState('');
  const [transportMode, setTransportMode] = useState('Ambulance 108 (MOCK)');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!summary.trim()) {
      setErrorMsg('Please enter a clinical summary for the referral note.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      const res = await generateReferralApi({
        patient_id: patient?.user_id || patient?.patient_id || 'anonymous',
        facility_id: facilityId,
        urgency,
        clinical_summary: summary.trim(),
        vitals: initialVitals || {},
        transport_mode: transportMode,
      });

      setSuccessMsg('Referral Note generated successfully! Starting PDF download...');

      // Download PDF
      if (res.data?.download_pdf_url) {
        const link = document.createElement('a');
        link.href = `/api${res.data.download_pdf_url}`;
        link.download = `Referral_${patient?.full_name || 'Patient'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 2000);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to generate referral note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t('referrals.modal_title') || 'Generate Patient Referral Note'}
              </h3>
              <p className="text-xs text-slate-500">
                Patient: <b>{patient?.full_name || 'Selected Patient'}</b>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleGenerate} className="mt-4 space-y-3.5">
          {/* Target Facility */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Receiving Medical Facility (MOCK) *
            </label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
            >
              {cachedFacilities.facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  {fac.name} ({fac.distance_km} km) - {fac.type}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transfer Priority / Urgency *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['emergency', 'urgent', 'routine'].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setUrgency(level)}
                  className={`py-2 rounded-xl text-xs font-bold uppercase transition-all border ${
                    urgency === level
                      ? level === 'emergency'
                        ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                        : level === 'urgent'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Transport Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Patient Transport Arrangement
            </label>
            <input
              type="text"
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              placeholder="e.g. Ambulance 108 (MOCK) / Private Vehicle"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
            />
          </div>

          {/* Clinical Summary */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Summary & Provisional Assessment *
            </label>
            <textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe symptoms, vital signs trend, emergency red-flags, and required tertiary care..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              Generates official transfer note with ReportLab.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{submitting ? 'Generating PDF...' : 'Generate & Download PDF'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
