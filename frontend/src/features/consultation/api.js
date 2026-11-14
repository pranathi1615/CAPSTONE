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

export const createRecurringSlotsApi = ({ days_of_week, start_time, end_time, slot_duration_minutes, weeks_count }) =>
  apiClient.post('/appointments/slots/recurring', {
    days_of_week,
    start_time,
    end_time,
    slot_duration_minutes,
    weeks_count,
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

// Phase 3: Adaptive Call, Voice Notes, and Mode Events
export const uploadVoiceNoteApi = (formData) =>
  apiClient.post('/chat/voice-notes/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const recordModeEventApi = ({ consultation_id, from_mode, to_mode, reason, stats_snapshot }) =>
  apiClient.post('/chat/mode-events', {
    consultation_id,
    from_mode,
    to_mode,
    reason,
    stats_snapshot,
  });

export const getModeEventsApi = (consultationId) =>
  apiClient.get(`/chat/mode-events/${consultationId}`);

export const getRoomMessagesGapApi = (roomId, afterSeq = 0) =>
  apiClient.get(`/chat/rooms/${roomId}/messages?after_seq=${afterSeq}`);
