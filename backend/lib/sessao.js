const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// Sessão obrigatória na API.
//
// Antes, toda rota confiava num `requester_id` vindo na URL ou no corpo —
// e um UUID não é segredo: quem tivesse o link de um endpoint lia os dados
// de qualquer pessoa. Agora a identidade vem do TOKEN da sessão do
// Supabase (Authorization: Bearer ...), que só o dono da conta tem.
//
// Duas travas, nesta ordem:
//  1. sem token válido → 401;
//  2. token válido, mas a chamada diz ser outra pessoa (requester_id, ou
//     user_id nas rotas em que ele identifica quem chama) → 403.
// As rotas continuam lendo requester_id como sempre — só que agora ele é
// conferido contra o token antes de chegar nelas.
//
// EXCEÇÕES (sem sessão por natureza): webhook e ativação da Hotmart, crons
// do GitHub Actions, links de descadastro que vão por e-mail, health, e os
// dois avisos que o service worker manda sem ter sessão.
// ─────────────────────────────────────────────────────────────

const SEM_SESSAO = [
  '/api/health',
  '/api/hotmart/webhook',
  '/api/hotmart/verificar-token',
  '/api/hotmart/ativar-conta',
  '/api/hotmart/verificar-vencimentos',
  '/api/resumo/diario',
  '/api/resumo/diario-bordo',
  '/api/resumo/descadastrar',
  '/api/resumo/descadastrar-diario',
  '/api/notificacoes/recebido',
  '/api/notificacoes/inscrever',
];

// Rotas em que `user_id` é QUEM CHAMA (e não a pessoa consultada). Em
// /schedule, /team, /desempenho e /gamificacao o user_id é o alvo — um
// líder vê a escala (e o time) do subordinado — e por isso ficam de fora
// desta lista; nelas a identidade é o requester_id, já conferido para todas.
const USER_ID_EH_O_CHAMADOR = [
  '/api/cashier', '/api/reacoes', '/api/reminders', '/api/scale',
  '/api/profile', '/api/notificacoes', '/api/agenda', '/api/mural', '/api/comunicados',
  '/api/anotacoes', '/api/listas', '/api/leaders', '/api/tarefas',
];

// Validar o token exige uma ida ao Supabase. Um token vale 1h; guardar o
// resultado por 10 min evita repetir a mesma pergunta a cada clique.
const cache = new Map();
const TTL = 10 * 60 * 1000;
async function usuarioDoToken(token) {
  const agora = Date.now();
  const c = cache.get(token);
  if (c && c.ate > agora) return c.id;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  if (cache.size > 5000) cache.clear();
  cache.set(token, { id: data.user.id, ate: agora + TTL });
  return data.user.id;
}

const caminho = (req) => (req.originalUrl || req.url || '').split('?')[0];
const comeca = (p, lista) => lista.some(x => p === x || p.startsWith(x + '/'));

async function exigirSessao(req, res, next) {
  const p = caminho(req);
  if (!p.startsWith('/api/')) return next();
  if (comeca(p, SEM_SESSAO)) return next();

  const cab = req.headers.authorization || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Sessão necessária. Entre de novo no app.' });

  let id;
  try { id = await usuarioDoToken(token); } catch { id = null; }
  if (!id) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre de novo no app.' });
  req.usuario = { id };

  // A chamada não pode dizer que é outra pessoa.
  const q = req.query || {}, b = (req.body && typeof req.body === 'object') ? req.body : {};
  const informados = [q.requester_id, b.requester_id, b.created_by, b.updated_by];
  if (comeca(p, USER_ID_EH_O_CHAMADOR)) informados.push(q.user_id, b.user_id);
  const outro = informados.find(v => v && String(v) !== id);
  if (outro) return res.status(403).json({ error: 'Esta sessão não corresponde ao usuário informado.' });

  next();
}

module.exports = { exigirSessao };
