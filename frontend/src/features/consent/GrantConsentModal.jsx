import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, X } from 'lucide-react';
import { grantConsentApi } from '../auth/api';

export const GrantConsentModal = ({ patientId, isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [purpose, setPurpose] = useState('teleconsultation');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await grantConsentApi(patientId, purpose);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to grant consent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            <span>{t('consent_modal.title')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('consent_modal.select_purpose')}
            </label>
            <div className="space-y-2">
              {[
                { id: 'teleconsultation', label: t('consent_modal.teleconsultation') },
                { id: 'medical_record_sharing', label: t('consent_modal.records_sharing') },
                { id: 'emergency_triage', label: t('consent_modal.emergency_triage') },
              ].map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    purpose === item.id
                      ? 'border-sky-500 bg-sky-50/50 text-slate-900 font-medium'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="purpose"
                    value={item.id}
                    checked={purpose === item.id}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="mt-1 w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 transition-colors text-sm shadow-xs"
            >
              {isSubmitting ? t('loading') : t('consent_modal.confirm_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
