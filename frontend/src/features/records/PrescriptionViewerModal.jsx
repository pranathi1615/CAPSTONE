import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  FileCheck,
  ShieldCheck,
  QrCode,
  MapPin,
  Pill,
  Calendar,
  User,
  AlertTriangle,
  Download,
} from 'lucide-react';

export const PrescriptionViewerModal = ({
  isOpen,
  onClose,
  prescription,
  onOpenPharmacyFinder,
}) => {
  const { t } = useTranslation();
  if (!isOpen || !prescription) return null;

  const isDispensed = prescription.status === 'dispensed';
  const isExpired = prescription.status === 'expired';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {t('prescriptions.viewer_title') || 'Digital Prescription'}
                </h3>
                {prescription.signature_valid && (
                  <span
                    data-testid="ed25519-valid-badge"
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Ed25519 Verified</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                ID: {prescription.prescription_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status notice */}
        {isDispensed && (
          <div
            data-testid="prescription-dispensed-notice"
            className="p-3 bg-slate-100 border border-slate-300 rounded-2xl text-xs text-slate-700 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="font-bold">Single-Use Complete: </span>
              <span>
                Dispensed on{' '}
                {prescription.dispensed_at
                  ? new Date(prescription.dispensed_at).toLocaleString()
                  : 'earlier'}{' '}
                at {prescription.dispensed_by_name || 'verified dispensary'}.
              </span>
            </div>
          </div>
        )}

        {/* Doctor & Patient Information */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Prescribing Doctor
            </span>
            <span className="font-bold text-slate-900 block mt-0.5">
              {prescription.doctor_name}
            </span>
            <span className="text-[11px] text-slate-600 block">
              Reg No: <strong>{prescription.doctor_registration_number}</strong>
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Patient
            </span>
            <span className="font-bold text-slate-900 block mt-0.5">
              {prescription.patient_name}
            </span>
            <span className="text-[11px] text-slate-600 block">
              Issued: {new Date(prescription.issued_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Medications List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5 text-indigo-600" />
            <span>Prescribed Drugs</span>
          </h4>

          <div className="space-y-2">
            {prescription.items?.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">
                    {idx + 1}. {item.drug_name}
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg">
                    {item.dose}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 flex items-center gap-3">
                  <span>
                    Frequency: <strong>{item.frequency}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Duration: <strong>{item.duration}</strong>
                  </span>
                </div>

                {item.instructions && (
                  <p className="text-[11px] text-sky-800 bg-sky-50 px-2 py-1 rounded-lg mt-1">
                    ℹ {item.instructions}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* QR Code Presentation for Dispensary Scanning */}
        <div className="p-4 bg-slate-900 text-white rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sky-400 text-xs font-bold">
              <QrCode className="w-4 h-4" />
              <span>Pharmacy Scan Code</span>
            </div>
            <p className="text-xs text-slate-300 max-w-xs">
              Present this tamper-proof cryptographic QR code at any verified CareBridge pharmacy for single-use dispense.
            </p>
            <span className="text-[10px] text-slate-500 font-mono block">
              Ed25519 Canonical Digest Verified
            </span>
          </div>

          <div className="bg-white p-2 rounded-2xl shadow-lg shrink-0">
            <img
              data-testid="prescription-qr-image"
              src={`/api/prescriptions/${prescription.prescription_id}/qr`}
              alt="Prescription QR Code"
              className="w-28 h-28 object-contain"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="open-pharmacy-finder-btn"
            onClick={() => {
              onClose();
              if (onOpenPharmacyFinder) onOpenPharmacyFinder();
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-98"
          >
            <MapPin className="w-4 h-4" />
            <span>Find Verified Pharmacies Near Me</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
