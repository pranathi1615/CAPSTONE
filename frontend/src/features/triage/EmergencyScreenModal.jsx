import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  PhoneCall,
  MapPin,
  FileText,
  X,
  ShieldAlert,
  Download,
  Hospital,
  Clock,
  Bed,
} from 'lucide-react';
import cachedFacilities from './emergency_facilities.json';
import { generateReferralApi } from './api';

export const EmergencyScreenModal = ({
  isOpen,
  onClose,
  triageResult,
  patient,
  vitals,
}) => {
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  if (!isOpen) return null;

  const facilities = triageResult?.nearest_facilities?.length
    ? triageResult.nearest_facilities
    : cachedFacilities.facilities;

  const nearest = facilities[0] || cachedFacilities.facilities[0];
  const lang = i18n.language || 'en';

  const disclaimerText =
    triageResult?.notice?.[lang] ||
    'Decision support only. Immediate emergency care is advised. A qualified doctor makes the final clinical decision.';

  const handleDownloadReferral = async () => {
    try {
      setDownloading(true);
      const res = await generateReferralApi({
        patient_id: patient?.user_id || patient?.patient_id || 'anonymous',
        facility_id: nearest.id,
        urgency: 'emergency',
        clinical_summary: `Emergency Red-Flag Escalation: ${triageResult?.reason || 'Critical Danger Sign'}`,
        vitals: vitals || {},
        red_flags_identified: triageResult?.reason,
        transport_mode: 'Ambulance 108 (MOCK)',
      });

      if (res.data?.download_pdf_url) {
        // Trigger browser download
        const fullUrl = `/api${res.data.download_pdf_url}`;
        setDownloadUrl(fullUrl);
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = `Referral_${patient?.full_name || 'Patient'}_Emergency.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Failed generating referral note:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      data-testid="emergency-screen"
      className="fixed inset-0 z-50 overflow-y-auto bg-rose-950/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border-4 border-rose-500 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Urgent Header */}
        <div className="flex items-start justify-between pb-4 border-b border-rose-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center animate-bounce shadow-lg shadow-rose-600/30">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 mb-1">
                Emergency Alert • Highest Priority
              </span>
              <h2 className="text-xl font-black text-rose-900 leading-tight">
                {t('triage.emergency_detected') || 'Critical Danger Sign Identified'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reason Banner */}
        <div className="mt-4 p-4 bg-rose-50 rounded-2xl border border-rose-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
              {t('triage.danger_reason') || 'Identified Red-Flag Reason:'}
            </h4>
            <p className="text-sm font-semibold text-rose-800 mt-0.5">
              {triageResult?.reason || 'Critical hemodynamic instability or red-flag symptom combination'}
            </p>
            <p className="text-[11px] text-rose-600 mt-1 italic">
              {disclaimerText}
            </p>
          </div>
        </div>

        {/* Quick Emergency Actions Grid */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Action 1: Call Ambulance 108 */}
          <a
            href="tel:108"
            className="flex items-center justify-between p-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-rose-100 block">
                  National Ambulance (MOCK)
                </span>
                <span className="text-xl font-black tracking-wider">Dial 108</span>
              </div>
            </div>
            <span className="text-xs font-bold underline group-hover:translate-x-0.5 transition-transform">
              Call Now
            </span>
          </a>

          {/* Action 2: Generate Transfer PDF */}
          <button
            type="button"
            data-testid="download-referral-pdf-btn"
            onClick={handleDownloadReferral}
            disabled={downloading}
            className="flex items-center justify-between p-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-600/20 transition-all group cursor-pointer text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-sky-100 block">
                  Transfer Documentation
                </span>
                <span className="text-sm font-bold block">
                  {downloading ? 'Generating PDF...' : 'Download Referral Note (PDF)'}
                </span>
              </div>
            </div>
            <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* Nearest Emergency Hospital Card */}
        {nearest && (
          <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Hospital className="w-4 h-4 text-sky-600" />
                <span>{nearest.name}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {nearest.open_24x7 ? 'Open 24x7' : 'Hospital'}
              </span>
            </div>

            <div className="text-xs text-slate-600 space-y-1 mb-3">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{nearest.address} ({nearest.distance_km} km away)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <Bed className="w-3 h-3 text-sky-500" />
                  ICU Beds Available: <b>{nearest.icu_beds_available}</b>
                </span>
                <span>• Blood Bank: <b>{nearest.blood_bank ? 'Available' : 'No'}</b></span>
              </div>
            </div>

            <a
              href={`tel:${nearest.emergency_phone}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
              <span>Call Emergency Desk ({nearest.emergency_phone})</span>
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
          <span className="text-slate-400">
            Emergency alert broadcast to on-call doctors.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
