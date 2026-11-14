import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileText, Plus, Trash2, KeyRound, CheckCircle, AlertCircle } from 'lucide-react';

export const PrescriptionWriterModal = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  consultationId = null,
  onPrescriptionCreated,
}) => {
  const { t } = useTranslation();
  const [items, setItems] = useState([
    { drug_name: '', dose: '', frequency: '1-0-1', duration: '5 days', instructions: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(14);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      { drug_name: '', dose: '', frequency: '1-0-1', duration: '5 days', instructions: '' },
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: patientId,
          patient_name: patientName,
          consultation_id: consultationId,
          items: items.map((it) => ({
            drug_name: it.drug_name.trim(),
            dose: it.dose.trim(),
            frequency: it.frequency.trim(),
            duration: it.duration.trim(),
            instructions: it.instructions.trim() || undefined,
          })),
          notes: notes.trim() || undefined,
          valid_days: parseInt(validDays, 10),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to issue signed prescription');
      }

      const createdRx = await response.json();
      if (onPrescriptionCreated) {
        onPrescriptionCreated(createdRx);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('prescriptions.issue_heading') || 'Issue Digital Prescription (Ed25519 Signed)'}
              </h3>
              <p className="text-xs text-slate-500">
                Patient: <span className="font-semibold text-slate-800">{patientName}</span> • Tamper-proof single-use
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

        {error && (
          <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {t('prescriptions.medications') || 'Prescribed Medications'}
              </h4>
              <button
                type="button"
                data-testid="add-medication-item-btn"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('prescriptions.add_drug') || 'Add Medication'}</span>
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5 relative"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Drug / Generic Name *
                    </label>
                    <input
                      type="text"
                      required
                      data-testid={`drug-name-${index}`}
                      value={item.drug_name}
                      onChange={(e) => handleItemChange(index, 'drug_name', e.target.value)}
                      placeholder="e.g. Paracetamol / Amoxicillin"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Dosage (mg / ml) *
                    </label>
                    <input
                      type="text"
                      required
                      data-testid={`drug-dose-${index}`}
                      value={item.dose}
                      onChange={(e) => handleItemChange(index, 'dose', e.target.value)}
                      placeholder="e.g. 500mg, 1 tablet"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Frequency
                    </label>
                    <select
                      value={item.frequency}
                      onChange={(e) => handleItemChange(index, 'frequency', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                    >
                      <option value="1-0-1">1-0-1 (Morning & Night)</option>
                      <option value="1-1-1">1-1-1 (Three times daily)</option>
                      <option value="1-0-0">1-0-0 (Morning only)</option>
                      <option value="0-0-1">0-0-1 (Night only)</option>
                      <option value="SOS">SOS (As needed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={item.duration}
                      onChange={(e) => handleItemChange(index, 'duration', e.target.value)}
                      placeholder="e.g. 5 days"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1 flex items-end justify-between sm:justify-start gap-2">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-2 text-rose-500 hover:text-rose-700 rounded-xl hover:bg-rose-50 transition"
                        title="Remove drug"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                    Instructions (Regional Language / English)
                  </label>
                  <input
                    type="text"
                    value={item.instructions}
                    onChange={(e) => handleItemChange(index, 'instructions', e.target.value)}
                    placeholder="e.g. Take after food with warm water / భోజనం తర్వాత"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Validity Period (Days)
              </label>
              <select
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
              >
                <option value={7}>7 Days</option>
                <option value={14}>14 Days (Standard)</option>
                <option value={30}>30 Days (Chronic)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Clinical Advice & Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Drink plenty of fluids, rest"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="p-3 bg-sky-50 rounded-2xl border border-sky-100 flex items-center gap-2.5 text-sky-800 text-xs">
            <KeyRound className="w-4 h-4 text-sky-600 shrink-0" />
            <span>
              Prescription will be digitally signed using your registered <strong>Ed25519</strong> private key.
              Tamper-evident verification guaranteed across pharmacies.
            </span>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="sign-issue-prescription-btn"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/20 transition active:scale-98"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSubmitting ? 'Signing...' : 'Sign & Issue Prescription'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
