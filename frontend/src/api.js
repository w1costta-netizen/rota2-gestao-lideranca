import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: BASE });

export const leadersAPI = {
  list: () => api.get('/leaders'),
  get: (id) => api.get(`/leaders/${id}`),
  create: (data) => api.post('/leaders', data),
  update: (id, data) => api.put(`/leaders/${id}`, data),
  remove: (id) => api.delete(`/leaders/${id}`),
  importCSV: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/leaders/import/csv', form);
  },
};

export const agendaAPI = {
  list: (week_start) => api.get('/agenda', { params: { week_start } }),
  forLeader: (id, week_start) => api.get(`/agenda/leader/${id}`, { params: { week_start } }),
  create: (data) => api.post('/agenda', data),
  update: (id, data) => api.put(`/agenda/${id}`, data),
  remove: (id) => api.delete(`/agenda/${id}`),
};

export const pdfAPI = {
  download: (leaderId, week_start) => {
    const base = import.meta.env.VITE_API_URL || '/api';
    window.open(`${base}/pdf/leader/${leaderId}?week_start=${week_start}`, '_blank');
  },
};

export default api;
