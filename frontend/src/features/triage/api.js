import { apiClient } from '../auth/api';

// Triage endpoints
export const evaluateTriageApi = ({ patient_id, patient_name, symptoms, symptom_text, vitals, age_group }) =>
  apiClient.post('/triage/evaluate', {
    patient_id,
    patient_name,
    symptoms,
    symptom_text,
    vitals,
    age_group,
  });

export const getTriageRulesApi = () =>
  apiClient.get('/triage/rules');

export const getEmergencyFacilitiesApi = () =>
  apiClient.get('/triage/facilities');

export const getPatientTriageHistoryApi = (patientId) =>
  apiClient.get(`/triage/evaluations/patient/${patientId}`);

// Async Consultations
export const submitAsyncConsultApi = (data) =>
  apiClient.post('/async-consults', data);

export const getDoctorAsyncInboxApi = () =>
  apiClient.get('/async-consults/doctor/inbox');

export const getPatientAsyncConsultsApi = () =>
  apiClient.get('/async-consults/patient/my');

export const getAsyncConsultDetailsApi = (consultId) =>
  apiClient.get(`/async-consults/${consultId}`);

export const replyAsyncConsultApi = (consultId, data) =>
  apiClient.post(`/async-consults/${consultId}/reply`, data);

// Follow-ups
export const createFollowUpApi = (data) =>
  apiClient.post('/followups', data);

export const getChwFollowupsDueTodayApi = () =>
  apiClient.get('/followups/chw/due-today');

export const completeFollowUpApi = (followupId) =>
  apiClient.post(`/followups/${followupId}/complete`);

export const processRemindersApi = (currentTime = null) =>
  apiClient.post('/followups/process-reminders', currentTime ? { current_time: currentTime } : {});

// Referrals
export const generateReferralApi = (data) =>
  apiClient.post('/referrals/generate', data);

export const getPatientReferralsApi = (patientId) =>
  apiClient.get(`/referrals/patient/${patientId}`);
