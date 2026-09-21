import axios from 'axios';
import { supabase } from './lib/supabase';

const BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: BASE, timeout: 90000 });

// Toda chamada à API leva o token da sessão do Supabase. É ele — e não o
// requester_id da URL — que diz ao servidor quem está pedindo. Sem isso o
// servidor responde 401.
export async function cabecalhoSessao() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}
api.interceptors.request.use(async (config) => {
  const cab = await cabecalhoSessao();
  if (cab.Authorization) { config.headers = config.headers || {}; config.headers.Authorization = cab.Authorization; }
  return config;
});

// 401 com sessão válida no navegador = aba com versão antiga do app. Quem
// estava com o app aberto durante um deploy segue com o código de antes na
// memória; se esse código não manda o que o servidor passou a exigir, tudo
// vira 401 até recarregar — e a pessoa vê "módulo adicional" e "não foi
// possível ativar" sem entender. Recarrega uma única vez por aba: se o 401
// for real (sessão inválida no servidor), o app segue para o login normal.
const CHAVE_401 = 'rota_recarregou_por_401';
api.interceptors.response.use(undefined, async (erro) => {
  if (erro?.response?.status === 401) {
    try {
      if (!sessionStorage.getItem(CHAVE_401)) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) { sessionStorage.setItem(CHAVE_401, '1'); window.location.reload(); }
      }
    } catch { /* sem sessionStorage não dá pra garantir o guarda: não recarrega */ }
  }
  return Promise.reject(erro);
});

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
  list: (week_start, company) => api.get('/agenda', { params: { week_start, ...(company ? { company } : {}) } }),
  forLeader: (id, week_start) => api.get(`/agenda/leader/${id}`, { params: { week_start } }),
  create: (data) => api.post('/agenda', data),
  update: (id, data) => api.put(`/agenda/${id}`, data),
  remove: (id, requesterId) => api.delete(`/agenda/${id}`, { params: { requester_id: requesterId } }),
};

export const pdfAPI = {
  // Baixa pela API (com token), não por window.open na URL: uma aba nova
  // não leva o Authorization e o servidor responderia 401.
  download: async (leaderId, week_start) => {
    const r = await api.get(`/pdf/leader/${leaderId}`, { params: { week_start }, responseType: 'blob' });
    const nome = (r.headers?.['content-disposition'] || '').match(/filename="?([^"]+)"?/)?.[1] || 'agenda.pdf';
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};

export default api;
