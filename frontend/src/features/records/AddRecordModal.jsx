import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Activity, AlertCircle, HeartPulse, Stethoscope, Save } from 'lucide-react';

export const AddRecordModal = ({ isOpen, onClose, onSave, patientId, doctorId = null }) => {
  const { t } = useTranslation();
  const [recordType, setRecordType] = useState('observation'); // observation, condition, allergy
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vitals form
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [temp, setTemp] = useState('');
  const [spo2, setSpo2] = useState('');
  const [weight, setWeight] = useState('');
  const [vitalsNotes, setVitalsNotes] = useState('');

  // Condition form
  const [conditionCode, setConditionCode] = useState('');
  const [clinicalStatus, setClinicalStatus] = useState('active');
  const [severity, setSeverity] = useState('moderate');
  const [conditionNotes, setConditionNotes] = useState('');

  // Allergy form
  const [substance, setSubstance] = useState('');
  const [criticality, setCriticality] = useState('high');
  const [manifestation, setManifestation] = useState('');
  const [allergyNotes, setAllergyNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let payloadData = {};
      if (recordType === 'observation') {
        payloadData = {
          resourceType: 'Observation',
          category: 'vital-signs',
          systolic_bp: systolic ? parseFloat(systolic) : undefined,
          diastolic_bp: diastolic ? parseFloat(diastolic) : undefined,
          pulse: pulse ? parseFloat(pulse) : undefined,
          temperature_c: temp ? parseFloat(temp) : undefined,
          spo2_percent: spo2 ? parseFloat(spo2) : undefined,
          weight_kg: weight ? parseFloat(weight) : undefined,
          effective_datetime: new Date().toISOString(),
          notes: vitalsNotes || undefined,
        };
      } else if (recordType === 'condition') {
        payloadData = {
          resourceType: 'Condition',
          code: conditionCode.trim(),
          clinical_status: clinicalStatus,
          verification_status: 'confirmed',
          severity,
          notes: conditionNotes || undefined,
        };
      } else if (recordType === 'allergy') {
        payloadData = {
          resourceType: 'AllergyIntolerance',
          substance: substance.trim(),
          clinical_status: 'active',
          verification_status: 'confirmed',
          criticality,
          manifestation: manifestation.trim() || undefined,
          notes: allergyNotes || undefined,
        };
      }

      await onSave({
        recordType,
        data: payloadData,
        doctorId,
      });

      onClose();
    } catch (err) {
      console.error('Failed creating record:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {t('clinical.add_record_title') || 'Log Clinical Record (FHIR R4)'}
              </h3>
              <p className="text-xs text-slate-500">
                {t('clinical.offline_saved_desc') || 'Saved locally in IndexedDB & synced automatically.'}
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

        {/* Record Type Selector */}
        <div className="grid grid-cols-3 gap-2 my-5">
          <button
            type="button"
            data-testid="type-observation-btn"
            onClick={() => setRecordType('observation')}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center gap-1.5 transition border ${
              recordType === 'observation'
                ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/20'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            <span>{t('clinical.type_vitals') || 'Vitals'}</span>
          </button>

          <button
            type="button"
            data-testid="type-condition-btn"
            onClick={() => setRecordType('condition')}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center gap-1.5 transition border ${
              recordType === 'condition'
                ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/20'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{t('clinical.type_condition') || 'Condition'}</span>
          </button>

          <button
            type="button"
            data-testid="type-allergy-btn"
            onClick={() => setRecordType('allergy')}
            className={`py-3 px-2 rounded-2xl text-xs font-bold flex flex-col items-center gap-1.5 transition border ${
              recordType === 'allergy'
                ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/20'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>{t('clinical.type_allergy') || 'Allergy'}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Observation / Vitals Form */}
          {recordType === 'observation' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.bp_systolic') || 'Systolic BP (mmHg)'}
                  </label>
                  <input
                    type="number"
                    data-testid="systolic-input"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    placeholder="e.g. 120"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.bp_diastolic') || 'Diastolic BP (mmHg)'}
                  </label>
                  <input
                    type="number"
                    data-testid="diastolic-input"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    placeholder="e.g. 80"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.pulse_rate') || 'Pulse (bpm)'}
                  </label>
                  <input
                    type="number"
                    data-testid="pulse-input"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    placeholder="e.g. 72"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.spo2') || 'SpO2 Oxygen (%)'}
                  </label>
                  <input
                    type="number"
                    data-testid="spo2-input"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    placeholder="e.g. 98"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.temperature') || 'Temperature (°C)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    data-testid="temp-input"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder="e.g. 37.0"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.weight') || 'Weight (kg)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    data-testid="weight-input"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g. 68.5"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.notes') || 'Clinical Notes / Context'}
                </label>
                <textarea
                  rows={2}
                  value={vitalsNotes}
                  onChange={(e) => setVitalsNotes(e.target.value)}
                  placeholder="e.g. Resting vitals measured at rural camp"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 2. Condition Form */}
          {recordType === 'condition' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.condition_name') || 'Condition / Diagnosis'} *
                </label>
                <input
                  type="text"
                  required
                  data-testid="condition-name-input"
                  value={conditionCode}
                  onChange={(e) => setConditionCode(e.target.value)}
                  placeholder="e.g. Acute Bronchitis, Hypertension"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.clinical_status') || 'Clinical Status'}
                  </label>
                  <select
                    value={clinicalStatus}
                    onChange={(e) => setClinicalStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="recurrence">Recurrence</option>
                    <option value="relapse">Relapse</option>
                    <option value="remission">Remission</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('clinical.severity') || 'Severity'}
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.notes') || 'Symptoms / Examination Notes'}
                </label>
                <textarea
                  rows={3}
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder="Describe onset, duration, and findings..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 3. Allergy Form */}
          {recordType === 'allergy' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.substance') || 'Allergen / Substance'} *
                </label>
                <input
                  type="text"
                  required
                  data-testid="allergy-substance-input"
                  value={substance}
                  onChange={(e) => setSubstance(e.target.value)}
                  placeholder="e.g. Penicillin, Peanuts, Sulfa"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.criticality') || 'Criticality'}
                </label>
                <select
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                >
                  <option value="low">Low Risk</option>
                  <option value="high">High Risk (Life Threatening)</option>
                  <option value="unable-to-assess">Unable to assess</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {t('clinical.manifestation') || 'Reaction Manifestation'}
                </label>
                <input
                  type="text"
                  value={manifestation}
                  onChange={(e) => setManifestation(e.target.value)}
                  placeholder="e.g. Urticaria, swelling, anaphylaxis"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              data-testid="save-record-submit-btn"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition active:scale-98"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : t('common.save') || 'Save Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
