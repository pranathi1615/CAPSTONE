import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UserCheck,
  UserPlus,
  ShieldCheck,
  Activity,
  HeartPulse,
  Send,
  Video,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  Lock,
} from 'lucide-react';
import { VoiceSymptomInput } from './VoiceSymptomInput';
import { evaluateVitalsOffline } from '../records/vitalsEvaluator';
import { syncEngine } from '../records/syncEngine';
import { db } from '../records/carebridgeDb';

export const AssistedVisitFlow = ({ chwUser, onVisitComplete }) => {
  const { t } = useTranslation();

  // Wizard Steps: 1: Patient -> 2: Consent (MANDATORY FIRST) -> 3: Symptoms -> 4: Vitals -> 5: Send
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Patient state
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isRegisteringNew, setIsRegisteringNew] = useState(false);
  const [newPatient, setNewPatient] = useState({
    full_name: '',
    phone: '',
    age: '',
    gender: 'female',
  });
  const [cachedPatients, setCachedPatients] = useState([]);

  // Step 2: Consent state (MANDATORY FIRST)
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentPurpose, setConsentPurpose] = useState('teleconsultation');
  const [recordedConsentId, setRecordedConsentId] = useState(null);

  // Step 3: Symptoms state
  const [symptoms, setSymptoms] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [symptomNotes, setSymptomNotes] = useState('');
  const [voiceNoteBlob, setVoiceNoteBlob] = useState(null);

  // Step 4: Vitals state
  const [vitals, setVitals] = useState({
    systolic: '',
    diastolic: '',
    blood_sugar: '',
    spo2: '',
    temperature: '',
    pulse: '',
  });
  const [evaluatedVitals, setEvaluatedVitals] = useState({ is_out_of_range: false, flags: [] });

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedVisit, setSubmittedVisit] = useState(null);
  const [statusBanner, setStatusBanner] = useState('');

  // Load cached patients from Dexie for offline lookup
  useEffect(() => {
    const loadCached = async () => {
      try {
        const patients = await db.cached_patients.toArray();
        if (patients && patients.length > 0) {
          setCachedPatients(patients);
        } else {
          // Seed standard synthetic demo patient for quick offline lookup
          const demoPatients = [
            {
              user_id: 'befe74db-99f7-4946-8afe-38c84a91e1b1',
              full_name: 'Anita Devi',
              phone: '+919800000004',
              email: 'patient.anita@carebridge.local',
            },
            {
              user_id: 'c8a24558-86d7-464a-9ef8-16147983c271',
              full_name: 'Kavita Verma',
              phone: '+919800000010',
              email: 'patient.demo@carebridge.local',
            },
          ];
          for (const p of demoPatients) {
            await db.cached_patients.put(p);
          }
          setCachedPatients(demoPatients);
        }
      } catch (e) {
        console.warn('Failed to load cached patients:', e);
      }
    };
    loadCached();
  }, []);

  // Live evaluation of vitals on every change
  useEffect(() => {
    const result = evaluateVitalsOffline(vitals);
    setEvaluatedVitals(result);
  }, [vitals]);

  // Handle Offline Quick Registration
  const handleQuickRegister = async (e) => {
    e.preventDefault();
    if (!newPatient.full_name.trim()) return;

    const patientId = crypto.randomUUID();
    const patientObj = {
      user_id: patientId,
      full_name: newPatient.full_name.trim(),
      phone: newPatient.phone.trim() || '+910000000000',
      age: newPatient.age ? parseInt(newPatient.age, 10) : null,
      gender: newPatient.gender,
      email: `offline.${patientId.slice(0, 8)}@carebridge.local`,
    };

    await db.cached_patients.put(patientObj);
    setCachedPatients((prev) => [...prev, patientObj]);
    setSelectedPatient(patientObj);
    setIsRegisteringNew(false);
    setCurrentStep(2); // Advance to MANDATORY CONSENT
  };

  // Handle Recording Consent FIRST
  const handleRecordConsentFirst = async () => {
    if (!selectedPatient) return;

    setIsSubmitting(true);
    try {
      const consentRes = await syncEngine.saveConsentLocally({
        patientId: selectedPatient.user_id,
        purpose: consentPurpose,
        grantedBy: chwUser?.user_id || 'chw-device-local',
        grantedByRole: 'chw',
      });

      setRecordedConsentId(consentRes.consent_id);
      setConsentGranted(true);
      setStatusBanner('Patient consent recorded and queued offline. Now capture clinical symptoms.');
      setCurrentStep(3); // Advance to Symptoms
    } catch (err) {
      console.error('Consent save failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Completed Assisted Visit
  const handleFinalSubmit = async (consultType = 'async_consult') => {
    if (!selectedPatient || !recordedConsentId) return;

    setIsSubmitting(true);
    try {
      const visitData = {
        visit_id: crypto.randomUUID(),
        patient_id: selectedPatient.user_id,
        patient_name: selectedPatient.full_name,
        patient_phone: selectedPatient.phone,
        patient_age: selectedPatient.age,
        patient_gender: selectedPatient.gender,
        chw_id: chwUser?.user_id || 'chw-local',
        chw_name: chwUser?.full_name || 'Community Health Worker',
        consent_id: recordedConsentId,
        status: consultType === 'live_call' ? 'call_started' : 'consult_requested',
        vitals: {
          systolic: vitals.systolic ? Number(vitals.systolic) : undefined,
          diastolic: vitals.diastolic ? Number(vitals.diastolic) : undefined,
          blood_sugar: vitals.blood_sugar ? Number(vitals.blood_sugar) : undefined,
          spo2: vitals.spo2 ? Number(vitals.spo2) : undefined,
          temperature: vitals.temperature ? Number(vitals.temperature) : undefined,
          pulse: vitals.pulse ? Number(vitals.pulse) : undefined,
        },
        symptoms,
        symptom_notes: symptomNotes || transcript,
        transcript,
        consultation_type: consultType,
        async_consult_summary: `CHW field consult for ${selectedPatient.full_name}. Symptoms: ${symptoms.join(', ')}.`,
        is_out_of_range: evaluatedVitals.is_out_of_range,
        out_of_range_flags: evaluatedVitals.flags,
      };

      const saved = await syncEngine.saveAssistedVisitLocally(visitData);
      setSubmittedVisit(saved);

      if (onVisitComplete) {
        onVisitComplete(saved);
      }
    } catch (err) {
      console.error('Failed to submit visit:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared-Device Safety: Clear visit form and reset session
  const handleEndVisitAndWipeLocal = () => {
    setSelectedPatient(null);
    setRecordedConsentId(null);
    setConsentGranted(false);
    setSymptoms([]);
    setTranscript('');
    setSymptomNotes('');
    setVoiceNoteBlob(null);
    setVitals({
      systolic: '',
      diastolic: '',
      blood_sugar: '',
      spo2: '',
      temperature: '',
      pulse: '',
    });
    setSubmittedVisit(null);
    setCurrentStep(1);
    setStatusBanner('Visit completed. Patient active session wiped from shared device for privacy.');
  };

  // Filter cached patients by search query
  const filteredPatients = cachedPatients.filter(
    (p) =>
      p.full_name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.phone?.includes(patientSearch) ||
      p.user_id?.includes(patientSearch)
  );

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
      {/* Title & Wizard Navigation Header */}
      <div className="border-b border-slate-100 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <HeartPulse className="w-6 h-6 text-amber-600" />
              <span>{t('assisted_visit.title') || 'CHW Assisted-Visit Workflow'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Works 100% offline with zero network connectivity. Queues in IndexedDB outbox.
            </p>
          </div>

          {/* Wizard Step Pills */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {[
              { num: 1, label: '1. Patient' },
              { num: 2, label: '2. Consent *' },
              { num: 3, label: '3. Symptoms' },
              { num: 4, label: '4. Vitals' },
              { num: 5, label: '5. Review' },
            ].map((st) => (
              <span
                key={st.num}
                className={`px-3 py-1.5 rounded-xl border text-[11px] transition-all ${
                  currentStep === st.num
                    ? 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                    : currentStep > st.num
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                {st.label}
              </span>
            ))}
          </div>
        </div>

        {statusBanner && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: PATIENT LOOKUP OR OFFLINE QUICK REGISTRATION */}
      {/* ========================================================================= */}
      {currentStep === 1 && !submittedVisit && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-600" />
              <span>Step 1: Look up or Register Patient</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsRegisteringNew(!isRegisteringNew)}
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isRegisteringNew ? 'Back to Search' : '+ Quick Register New Patient (Offline)'}</span>
            </button>
          </div>

          {!isRegisteringNew ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="patient-search-input"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search by name, phone (+91...), or UUID..."
                  className="w-full text-xs pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {filteredPatients.length === 0 ? (
                  <div className="p-4 text-center border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
                    No matching patient in local store. Tap above to quick-register offline.
                  </div>
                ) : (
                  filteredPatients.map((p) => (
                    <div
                      key={p.user_id}
                      data-testid={`select-patient-${p.user_id}`}
                      onClick={() => {
                        setSelectedPatient(p);
                        setCurrentStep(2); // Advance to MANDATORY CONSENT
                      }}
                      className="p-3.5 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 cursor-pointer flex items-center justify-between transition-all bg-white shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs">
                          {p.full_name?.charAt(0) || 'P'}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-900 block">{p.full_name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {p.phone || 'No phone'} • ID: {p.user_id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-600">Select →</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleQuickRegister} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h5 className="text-xs font-bold text-slate-800">Quick Offline Patient Registration</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    data-testid="new-patient-name"
                    value={newPatient.full_name}
                    onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    data-testid="new-patient-phone"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    placeholder="+91..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    data-testid="new-patient-age"
                    value={newPatient.age}
                    onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                    placeholder="Age (years)"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisteringNew(false)}
                  className="px-4 py-2 rounded-xl border text-xs text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-new-patient-btn"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
                >
                  Save Patient & Proceed to Consent
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: RECORD CONSENT FIRST (MANDATORY GATEWAY) */}
      {/* ========================================================================= */}
      {currentStep === 2 && !submittedVisit && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-700" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Step 2: Mandatory Telehealth Consent (Record FIRST)
                </h4>
                <p className="text-[11px] text-slate-600">
                  Standing Rule: Patient consent must be recorded prior to capturing clinical symptoms or vitals.
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-amber-200/80 text-xs text-slate-800 space-y-2">
              <span className="font-bold block text-slate-900">
                Patient: {selectedPatient?.full_name} ({selectedPatient?.user_id?.slice(0, 8)}...)
              </span>
              <p className="text-[11px] text-slate-600">
                "I confirm that the patient has been verbally explained the purpose of this telehealth visit in their regional language (Telugu/Hindi/English) and agrees to share health records with verified doctors."
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Consent Purpose *</label>
                <select
                  data-testid="consent-purpose-select"
                  value={consentPurpose}
                  onChange={(e) => setConsentPurpose(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="teleconsultation">General Teleconsultation & Video Visit</option>
                  <option value="medical_record_sharing">Medical Records & History Sharing</option>
                  <option value="emergency_triage">Emergency Triage & Urgent Care</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-xs text-slate-500 font-semibold hover:underline"
              >
                ← Back to Patient Selection
              </button>

              <button
                type="button"
                data-testid="grant-consent-first-btn"
                disabled={isSubmitting}
                onClick={handleRecordConsentFirst}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmitting ? 'Recording Consent...' : 'Confirm Consent & Proceed to Symptoms →'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: REGIONAL VOICE & ICON SYMPTOMS INPUT */}
      {/* ========================================================================= */}
      {currentStep === 3 && !submittedVisit && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600" />
              <span>Step 3: Capture Symptoms & Voice Notes</span>
            </h4>
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
              Consent Verified ✓
            </span>
          </div>

          <VoiceSymptomInput
            selectedSymptoms={symptoms}
            onSymptomsChange={setSymptoms}
            transcript={transcript}
            onTranscriptChange={setTranscript}
            voiceNoteBlob={voiceNoteBlob}
            onVoiceNoteBlobChange={setVoiceNoteBlob}
          />

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-xs text-slate-500 font-semibold hover:underline"
            >
              ← Back to Consent
            </button>

            <button
              type="button"
              data-testid="proceed-to-vitals-btn"
              onClick={() => setCurrentStep(4)}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 cursor-pointer"
            >
              Proceed to Vitals Capture →
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: CAPTURE VITALS WITH LIVE OUT-OF-RANGE WARNINGS */}
      {/* ========================================================================= */}
      {currentStep === 4 && !submittedVisit && (
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-600" />
                <span>Step 4: Capture Patient Vitals</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Values evaluated against clinical ranges in real time with abnormal warning flags.
              </p>
            </div>

            {evaluatedVitals.is_out_of_range && (
              <span
                data-testid="out-of-range-alert-chip"
                className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{evaluatedVitals.flags.length} Abnormal Flag(s)</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Blood Pressure Systolic */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Systolic BP (mmHg)</label>
              <input
                type="number"
                data-testid="vitals-systolic-input"
                value={vitals.systolic}
                onChange={(e) => setVitals({ ...vitals, systolic: e.target.value })}
                placeholder="Normal: 90 - 120"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Target: 90–120 mmHg</span>
            </div>

            {/* Blood Pressure Diastolic */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Diastolic BP (mmHg)</label>
              <input
                type="number"
                data-testid="vitals-diastolic-input"
                value={vitals.diastolic}
                onChange={(e) => setVitals({ ...vitals, diastolic: e.target.value })}
                placeholder="Normal: 60 - 80"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Target: 60–80 mmHg</span>
            </div>

            {/* Blood Sugar */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Blood Sugar (mg/dL)</label>
              <input
                type="number"
                data-testid="vitals-sugar-input"
                value={vitals.blood_sugar}
                onChange={(e) => setVitals({ ...vitals, blood_sugar: e.target.value })}
                placeholder="Normal: 70 - 140"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Random/Fasting glucometer reading</span>
            </div>

            {/* SpO2 */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">SpO2 Oxygen (%)</label>
              <input
                type="number"
                data-testid="vitals-spo2-input"
                value={vitals.spo2}
                onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                placeholder="Normal: 95 - 100"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Alert if &lt;94%</span>
            </div>

            {/* Temperature */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Temperature (°C)</label>
              <input
                type="number"
                step="0.1"
                data-testid="vitals-temp-input"
                value={vitals.temperature}
                onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                placeholder="Normal: 36.5 - 37.2"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Fever alert if ≥37.5°C</span>
            </div>

            {/* Pulse */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">Pulse (bpm)</label>
              <input
                type="number"
                data-testid="vitals-pulse-input"
                value={vitals.pulse}
                onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })}
                placeholder="Normal: 60 - 100"
                className="w-full text-sm font-mono p-2.5 rounded-xl border border-slate-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">Radial pulse rate</span>
            </div>
          </div>

          {/* Out-Of-Range Clinical Flags Display */}
          {evaluatedVitals.flags.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
              <h5 className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Detected Out-of-Range Clinical Values:</span>
              </h5>
              <div className="space-y-1">
                {evaluatedVitals.flags.map((flag, idx) => (
                  <div key={idx} className="text-xs text-rose-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                    <span>{flag.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="text-xs text-slate-500 font-semibold hover:underline"
            >
              ← Back to Symptoms
            </button>

            <button
              type="button"
              data-testid="proceed-to-review-btn"
              onClick={() => setCurrentStep(5)}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 cursor-pointer"
            >
              Proceed to Review & Send →
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 5: REVIEW, DECISION & OFFLINE OUTBOX SUBMISSION */}
      {/* ========================================================================= */}
      {currentStep === 5 && !submittedVisit && (
        <div className="space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-800">Step 5: Review Visit & Choose Delivery Mode</h4>
            <p className="text-[11px] text-slate-500">
              The visit screen works fully offline. Records are saved locally in Dexie and synchronized when internet returns.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500">Patient:</span>
              <span className="font-bold text-slate-900">{selectedPatient?.full_name}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500">Consent:</span>
              <span className="text-emerald-700 font-semibold">Granted (ID: {recordedConsentId?.slice(0, 8)}...)</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500">Symptoms ({symptoms.length}):</span>
              <span className="font-medium text-slate-900">{symptoms.join(', ') || 'None selected'}</span>
            </div>
            {transcript && (
              <div className="border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 block mb-1">Transcript:</span>
                <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200">{transcript}</p>
              </div>
            )}
            <div>
              <span className="text-slate-500 block mb-1">Captured Vitals:</span>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {vitals.systolic && <span className="bg-white px-2 py-1 rounded-md border font-mono">BP: {vitals.systolic}/{vitals.diastolic} mmHg</span>}
                {vitals.blood_sugar && <span className="bg-white px-2 py-1 rounded-md border font-mono">Sugar: {vitals.blood_sugar} mg/dL</span>}
                {vitals.spo2 && <span className="bg-white px-2 py-1 rounded-md border font-mono">SpO2: {vitals.spo2}%</span>}
                {vitals.temperature && <span className="bg-white px-2 py-1 rounded-md border font-mono">Temp: {vitals.temperature}°C</span>}
                {vitals.pulse && <span className="bg-white px-2 py-1 rounded-md border font-mono">Pulse: {vitals.pulse} bpm</span>}
              </div>
            </div>
          </div>

          {/* Delivery Mode Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              type="button"
              data-testid="submit-async-consult-btn"
              disabled={isSubmitting}
              onClick={() => handleFinalSubmit('async_consult')}
              className="p-5 rounded-2xl border-2 border-amber-500 bg-amber-50/60 hover:bg-amber-50 transition text-left cursor-pointer space-y-2 shadow-xs"
            >
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Send className="w-5 h-5 text-amber-700" />
                <span>Send Asynchronous Consult (Offline / Weak)</span>
              </div>
              <p className="text-xs text-slate-600">
                Ideal for 2G, weak network, or offline visits. Queued in local IndexedDB and delivered to doctor when connectivity returns.
              </p>
            </button>

            <button
              type="button"
              data-testid="submit-live-call-btn"
              disabled={isSubmitting}
              onClick={() => handleFinalSubmit('live_call')}
              className="p-5 rounded-2xl border border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50 transition text-left cursor-pointer space-y-2 shadow-xs"
            >
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <Video className="w-5 h-5 text-emerald-700" />
                <span>Start Live Teleconsultation (Good Network)</span>
              </div>
              <p className="text-xs text-slate-600">
                If network quality is currently adequate, queues patient for immediate WebRTC consultation with an approved doctor.
              </p>
            </button>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="text-xs text-slate-500 font-semibold hover:underline"
            >
              ← Back to Vitals
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISIT COMPLETION CONFIRMATION & SHARED-DEVICE DATA WIPE */}
      {/* ========================================================================= */}
      {submittedVisit && (
        <div data-testid="visit-completed-banner" className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-base font-bold text-emerald-950">
                Assisted Visit Saved & Queued Successfully!
              </h4>
              <p className="text-xs text-emerald-800">
                Visit UUID: <span className="font-mono">{submittedVisit.visit_id}</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-emerald-900">
            All records (consent, symptoms, vitals observation) are committed into local IndexedDB and queued in the sync outbox. When the device is online, they will reach the server automatically.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="end-visit-wipe-btn"
              onClick={handleEndVisitAndWipeLocal}
              className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer transition active:scale-95"
            >
              <Lock className="w-4 h-4" />
              <span>End Visit (Clear Patient Data from Shared Device)</span>
            </button>

            <button
              type="button"
              onClick={handleEndVisitAndWipeLocal}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Start New Visit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
