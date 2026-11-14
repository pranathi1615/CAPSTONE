import { apiClient } from '../auth/api';

// Appointments & Scheduling
export const getApprovedDoctorsApi = (specialty = '') =>
  apiClient.get(`/appointments/doctors${specialty ? `?specialty=${encodeURIComponent(specialty)}` : ''}`);

export const getDoctorSlotsApi = (doctorId) =>
  apiClient.get(`/appointments/slots?doctor_id=${doctorId}`);

export const createDoctorSlotApi = (slotStart, slotEnd) =>
  apiClient.post('/appointments/slots', {
    slot_start: slotStart,
    slot_end: slotEnd,
  });

export const bookAppointmentApi = ({ doctor_id, slot_start, slot_end, reason = '', patient_id = null }) =>
  apiClient.post('/appointments/book', {
    doctor_id,
    slot_start,
    slot_end,
    reason,
    patient_id,
  });

export const getMyAppointmentsApi = () =>
  apiClient.get('/appointments/my');

export const joinAppointmentApi = (bookingId) =>
  apiClient.post(`/appointments/${bookingId}/join`);

export const getDoctorQueueApi = () =>
  apiClient.get('/appointments/queue');

export const callPatientApi = (bookingId) =>
  apiClient.post(`/appointments/${bookingId}/call`);

export const completeConsultationApi = (bookingId, notes = '') =>
  apiClient.post(`/appointments/${bookingId}/complete`, { notes });

export const cancelAppointmentApi = (bookingId) =>
  apiClient.post(`/appointments/${bookingId}/cancel`);

// WebRTC & Signalling Config
export const getIceServersApi = () =>
  apiClient.get('/appointments/config/ice-servers');

export const getConsultationMessagesApi = (roomId) =>
  apiClient.get(`/appointments/consultations/${roomId}/messages`);

// Notifications / Mock SMS Inbox
export const getMockSmsInboxApi = (limit = 50) =>
  apiClient.get(`/notifications/mock-inbox?limit=${limit}`);
