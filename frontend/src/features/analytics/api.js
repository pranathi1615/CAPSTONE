import { apiClient } from '../auth/api';

export const getAnalyticsSummaryApi = () => apiClient.get('/analytics/summary');
export const getEpidemiologicalApi = () => apiClient.get('/analytics/epidemiological');
export const getNetworkDegradationApi = () => apiClient.get('/analytics/network-degradation');
export const getAuditStatsApi = () => apiClient.get('/audit/stats');
