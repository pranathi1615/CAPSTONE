import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pill,
  QrCode,
  Store,
  CheckCircle,
  AlertTriangle,
  Search,
  ShieldCheck,
  Clock,
  User,
  FileCheck,
  RefreshCw,
  Camera,
  Upload,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const PharmacyDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [prescriptionInput, setPrescriptionInput] = useState('');
  const [scannedPrescription, setScannedPrescription] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDispensing, setIsDispensing] = useState(false);
  const [dispenseResult, setDispenseResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [dispenseNotes, setDispenseNotes] = useState('');

  // Mock inventory list for the pharmacy
  const [inventory] = useState([
    { drug: 'Amoxicillin 500mg', generic: 'Amoxicillin', stock: 124, unit: 'strips', status: 'in_stock' },
    { drug: 'Paracetamol 650mg', generic: 'Paracetamol', stock: 350, unit: 'strips', status: 'in_stock' },
    { drug: 'Cetirizine 10mg', generic: 'Cetirizine', stock: 80, unit: 'strips', status: 'in_stock' },
    { drug: 'Azithromycin 500mg', generic: 'Azithromycin', stock: 15, unit: 'strips', status: 'partial_stock' },
    { drug: 'Metformin 500mg', generic: 'Metformin', stock: 210, unit: 'strips', status: 'in_stock' },
  ]);

  const handleVerifyPrescription = async (presId) => {
    const idToVerify = presId || prescriptionInput.trim();
    if (!idToVerify) return;

    setIsVerifying(true);
    setErrorMessage(null);
    setDispenseResult(null);

    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      // If QR payload contains JSON with 'id'
      let cleanId = idToVerify;
      if (idToVerify.startsWith('{')) {
        try {
          const parsed = JSON.parse(idToVerify);
          cleanId = parsed.id || idToVerify;
        } catch {
          cleanId = idToVerify;
        }
      }

      const res = await fetch(`/api/prescriptions/${cleanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Prescription not found or invalid');
      }

      const data = await res.json();
      setScannedPrescription(data);
    } catch (err) {
      setErrorMessage(err.message);
      setScannedPrescription(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDispense = async () => {
    if (!scannedPrescription) return;

    setIsDispensing(true);
    setErrorMessage(null);

    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const res = await fetch(
        `/api/prescriptions/${scannedPrescription.prescription_id}/dispense`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ notes: dispenseNotes || 'Dispensed at counter' }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        // Atomic duplicate dispense conflict or validation error
        throw new Error(data.detail || 'Dispense failed');
      }

      setDispenseResult(data);
      // Refresh prescription status
      setScannedPrescription((prev) => ({
        ...prev,
        status: 'dispensed',
        dispensed_at: data.dispensed_at,
        dispensed_by_name: data.dispensed_by_name,
      }));
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsDispensing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
            <Pill className="w-7 h-7" />
          </div>
          <div>
            <h2 data-testid="pharmacy-dashboard-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('pharmacy_dashboard.welcome') || 'Pharmacy Verification & Dispensary Gateway'}
            </h2>
            <p className="text-emerald-100 text-xs sm:text-sm mt-0.5">
              {user?.full_name} • Ed25519 Cryptographic Verification & Single-Use Dispense
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: QR Scanner & Lookup */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {t('pharmacy_dashboard.scanner_heading') || 'Scan Prescription QR / Code'}
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold">Single-Use Atomic Guard</span>
            </div>

            {/* Input field for QR text or UUID */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyPrescription();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="prescription-search-input"
                  value={prescriptionInput}
                  onChange={(e) => setPrescriptionInput(e.target.value)}
                  placeholder="Paste Prescription UUID, QR JSON payload, or code..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <button
                type="submit"
                data-testid="verify-prescription-btn"
                disabled={isVerifying || !prescriptionInput.trim()}
                className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-98"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isVerifying ? 'Checking...' : 'Verify'}</span>
              </button>
            </form>

            {/* Error Message */}
            {errorMessage && (
              <div
                data-testid="dispense-error-banner"
                className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-xs text-red-800 flex items-start gap-2.5 animate-fadeIn"
              >
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-red-900">Verification / Dispense Refused</h5>
                  <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Dispense Success Message */}
            {dispenseResult && (
              <div
                data-testid="dispense-success-banner"
                className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-xs text-emerald-900 flex items-start gap-2.5 animate-fadeIn"
              >
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-emerald-950">Dispensed Successfully (Single-Use Locked)</h5>
                  <p className="mt-0.5">{dispenseResult.message}</p>
                  <p className="text-[10px] text-emerald-700 mt-1 font-mono">
                    Time: {new Date(dispenseResult.dispensed_at).toLocaleString()} • By:{' '}
                    {dispenseResult.dispensed_by_name}
                  </p>
                </div>
              </div>
            )}

            {/* Scanned Prescription Card */}
            {scannedPrescription && (
              <div
                data-testid="scanned-prescription-details"
                className="mt-4 p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">Digital Prescription</h4>
                      {scannedPrescription.signature_valid ? (
                        <span
                          data-testid="ed25519-verified-chip"
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Ed25519 Signature Verified ✓</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          Signature Invalid ✕
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      UUID: {scannedPrescription.prescription_id}
                    </span>
                  </div>

                  <div>
                    {scannedPrescription.status === 'issued' ? (
                      <span
                        data-testid="status-issued-badge"
                        className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-300"
                      >
                        VALID & READY TO DISPENSE
                      </span>
                    ) : scannedPrescription.status === 'dispensed' ? (
                      <span
                        data-testid="status-dispensed-badge"
                        className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>ALREADY DISPENSED</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-slate-200 text-slate-700">
                        {scannedPrescription.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient and Doctor metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Patient
                    </span>
                    <span className="font-bold text-slate-900 block mt-0.5">
                      {scannedPrescription.patient_name}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      ID: {scannedPrescription.patient_id.slice(0, 12)}...
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">
                      Prescribing Doctor
                    </span>
                    <span className="font-bold text-slate-900 block mt-0.5">
                      {scannedPrescription.doctor_name}
                    </span>
                    <span className="text-[11px] text-slate-600 block">
                      Reg No: <strong>{scannedPrescription.doctor_registration_number}</strong>
                    </span>
                  </div>
                </div>

                {/* Medication Items */}
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Medication Order ({scannedPrescription.items?.length} items)
                  </h5>

                  <div className="space-y-1.5">
                    {scannedPrescription.items?.map((it, i) => (
                      <div
                        key={i}
                        className="p-3 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {i + 1}. {it.drug_name} — {it.dose}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Frequency: {it.frequency} • Duration: {it.duration}
                          </span>
                          {it.instructions && (
                            <span className="text-[11px] text-sky-700 block mt-0.5">
                              ℹ {it.instructions}
                            </span>
                          )}
                        </div>

                        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                          Generic Available
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Single-use Dispense Action Bar */}
                <div className="pt-2 border-t border-slate-200">
                  {scannedPrescription.status === 'issued' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Dispense Notes / Batch Reference
                        </label>
                        <input
                          type="text"
                          value={dispenseNotes}
                          onChange={(e) => setDispenseNotes(e.target.value)}
                          placeholder="e.g. Batch #AMX-2026-09, Full strip provided"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <button
                        type="button"
                        data-testid="confirm-dispense-btn"
                        disabled={isDispensing}
                        onClick={handleDispense}
                        className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-98"
                      >
                        <Pill className="w-5 h-5" />
                        <span>
                          {isDispensing
                            ? 'Executing Atomic Dispense...'
                            : 'Dispense Prescription (Atomic Single-Use)'}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        This prescription is <strong>already dispensed</strong>. The CareBridge single-use
                        atomic rule blocks any further dispensing.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Generic Stock Inventory (MOCK) */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {t('pharmacy_dashboard.stock_management_shell') || 'Generic Stock Inventory'}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                MOCK INVENTORY
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Live generic inventory status shared with rural teleconsultation clinics.
            </p>

            <div className="space-y-2">
              {inventory.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between"
                >
                  <div>
                    <h5 className="font-bold text-slate-900">{item.drug}</h5>
                    <span className="text-[10px] text-slate-500">Generic: {item.generic}</span>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-slate-800 block">
                      {item.stock} {item.unit}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                        item.status === 'in_stock'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.status === 'in_stock' ? 'In Stock' : 'Low Stock'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
