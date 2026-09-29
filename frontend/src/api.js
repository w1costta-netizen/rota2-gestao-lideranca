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

// SESSÃO EXPIRADA: renovar, repetir a chamada, e só desistir depois disso.
//
// O token do login vale 1 hora. Quando ele vencia, TODA chamada voltava 401
// e cada tela mostrava o próprio "nada encontrado": Conversas vazia, lista
// de usuários vazia, log sem registrar. Nada dizia que o problema era a
// sessão — e o app parecia quebrado por inteiro. Aconteceu duas vezes.
//
// Agora: tenta renovar, repete a chamada com o token novo, e a pessoa nem
// percebe. Se a renovação falhar, a sessão morreu de verdade: encerra e
// manda para o login com a explicação, em vez de deixar telas vazias.
export const CHAVE_EXPIROU = 'rota_sessao_expirou';

// Só reage ao 401 do middleware de sessão. Várias rotas devolvem 401 por
// outro motivo (requester_id ausente), e deslogar por causa desses seria
// pior que o problema.
const ehDeSessao = (erro) => erro?.response?.data?.codigo === 'sessao';

// Uma renovação por vez. Dez telas carregando juntas dispariam dez refresh,
// e o Supabase invalida o refresh token assim que um é usado — as outras
// nove falhariam e derrubariam a sessão de quem estava bem.
let renovando = null;
const renovar = () => {
  renovando = renovando || supabase.auth.refreshSession()
    .finally(() => { renovando = null; });
  return renovando;
};

api.interceptors.response.use(undefined, async (erro) => {
  const req = erro?.config;
  if (!ehDeSessao(erro) || !req || req._jaRenovou) return Promise.reject(erro);
  req._jaRenovou = true;

  try {
    const { data, error } = await renovar();
    const token = data?.session?.access_token;
    if (!error && token) {
      // Na repetição o interceptor de request roda de novo e normalmente já
      // pega o token novo pelo getSession(). O cabeçalho posto aqui à mão é
      // a rede de segurança para quando o getSession falhar: nesse caso ele
      // não sobrescreve nada, e a chamada ainda vai assinada.
      req.headers = { ...(req.headers || {}), Authorization: `Bearer ${token}` };
      return api.request(req);
    }
  } catch { /* segue para o encerramento */ }

  try {
    localStorage.setItem(CHAVE_EXPIROU, '1');
    await supabase.auth.signOut();
  } catch { /* sem storage ou sem rede: o reload abaixo resolve mesmo assim */ }
  window.location.reload();
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
