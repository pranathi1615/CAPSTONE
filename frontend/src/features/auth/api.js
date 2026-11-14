import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject bearer token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle expired tokens via refresh token rotation
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token: newRefresh } = res.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefresh);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const loginApi = (email, password) =>
  apiClient.post('/auth/login', { email, password });

export const registerApi = (data) =>
  apiClient.post('/auth/register', data);

export const getMeApi = () =>
  apiClient.get('/auth/me');

// Doctor verification (Admin)
export const getPendingDoctorsApi = () =>
  apiClient.get('/auth/doctors/pending');

export const approveDoctorApi = (doctorId, approved = true, reason = '') =>
  apiClient.post(`/auth/doctors/${doctorId}/approve`, {
    approved,
    rejection_reason: reason || null,
  });

// Consent endpoints
export const getPatientConsentsApi = (patientId) =>
  apiClient.get(`/consents/patient/${patientId}`);

export const grantConsentApi = (patientId, purpose) =>
  apiClient.post('/consents', { patient_id: patientId, purpose });

export const revokeConsentApi = (consentId) =>
  apiClient.post(`/consents/${consentId}/revoke`);

// Audit endpoints (Admin)
export const getAuditLogsApi = (limit = 50) =>
  apiClient.get(`/audit?limit=${limit}`);

export const verifyAuditChainApi = () =>
  apiClient.get('/audit/verify');
