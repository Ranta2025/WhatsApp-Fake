import api from './axios';

export const getStatusFeed = () => api.get('/api/v1/status');

export const createStatus = (payload) => api.post('/api/v1/status', payload);

export const markStatusViewed = (statusID) => api.put(`/api/v1/status/${statusID}/view`);

export const deleteStatus = (statusID) => api.delete(`/api/v1/status/${statusID}`);