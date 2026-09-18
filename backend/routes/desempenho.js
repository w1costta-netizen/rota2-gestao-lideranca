const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { DIMENSOES, coletar, analisarPessoa, analisarEquipe } = require('../lib/desempenho');
const { cadeiaDeSubordinados } = require('../lib/equipe');

// ─────────────────────────────────────────────────────────────
// Análise de desempenho (pessoa e equipe). O cálculo está em
// lib/desempenho.js; aqui só quem pode ver o quê.
//
// QUEM VÊ O QUÊ (regra do dono do produto, 18/09/2026: "apenas o deles e
// dos seus subordinados"):
//  - todo mundo vê a PRÓPRIA análise;
//  - supervisor e líder veem quem responde a eles (reports_to_list) e a
//    cadeia abaixo — o subordinado do subordinado também é equipe dele;
//  - admin (gerente da loja) e master veem a loja inteira.
// Fora disso, 403. Nota de desempenho é dado sensível: ver a de um colega
// sem ser líder dele vira comparação de corredor.
// ─────────────────────────────────────────────────────────────

const GESTOR = ['admin', 'master'];

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase.from('profiles')
    .select('id, full_name, company, access_level, active, sector, role, avatar_url')
    .eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

// Período: `de`/`ate` explícitos, ou os últimos N dias (padrão 30).
function periodoDe(q) {
  const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // Brasília
  if (ehData(q.de) && ehData(q.ate) && q.de <= q.ate) return { de: q.de, ate: q.ate };
  const dias = Math.min(180, Math.max(7, parseInt(q.dias, 10) || 30));
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (dias - 1));
  return { de: d.toISOString().slice(0, 10), ate: hoje };
}

// Pessoas da loja que o requisitante pode analisar.
async function equipeVisivel(me, company) {
  const { todos, subordinados } = await cadeiaDeSubordinados(company, me.id);
  if (GESTOR.includes(me.access_level)) return todos;
  const ids = new Set([me.id, ...subordinados.map(p => p.id)]);
  return todos.filter(p => ids.has(p.id));
}

// GET /api/desempenho/pessoas?requester_id= — quem aparece no seletor
router.get('/pessoas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const company = me.access_level === 'master' ? (req.query.company || me.company) : me.company;
  if (!company) return res.json({ pessoas: [], veEquipe: false });
  const pessoas = await equipeVisivel(me, company);
  res.json({
    pessoas: pessoas.map(p => ({ id: p.id, nome: p.full_name, setor: p.sector, cargo: p.role, avatar_url: p.avatar_url })),
    veEquipe: pessoas.length > 1,
    dimensoes: DIMENSOES,
  });
});

// GET /api/desempenho/pessoa?requester_id=&user_id=&dias=|de=&ate=
router.get('/pessoa', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const alvoId = req.query.user_id || me.id;

  const alvo = await getPerfil(alvoId);
  if (!alvo) return res.status(404).json({ error: 'Pessoa não encontrada' });
  if (me.access_level !== 'master' && alvo.company !== me.company) return res.status(403).json({ error: 'Acesso negado' });
  if (alvoId !== me.id) {
    const visiveis = await equipeVisivel(me, alvo.company);
    if (!visiveis.some(p => p.id === alvoId)) return res.status(403).json({ error: 'Você só pode ver a análise de quem responde a você.' });
  }

  const { de, ate } = periodoDe(req.query);
  try {
    const dados = await coletar(alvo.company, [alvoId], de, ate);
    const analise = analisarPessoa(alvo, dados, de, ate);
    if (alvoId !== me.id) {
      registrarLog('ver_desempenho', 'profiles', 'sucesso', { company: alvo.company, user_id: me.id, depois: { de_quem: alvoId, de, ate } });
    }
    res.json(analise);
  } catch (e) {
    registrarLog('ver_desempenho', 'profiles', 'erro', { company: alvo.company, user_id: me.id, rota: req.originalUrl, erro: e.message });
    res.status(500).json({ error: 'Não foi possível montar a análise.' });
  }
});

// GET /api/desempenho/equipe?requester_id=&dias=|de=&ate=&company=
router.get('/equipe', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const company = me.access_level === 'master' ? (req.query.company || me.company) : me.company;
  if (!company) return res.status(400).json({ error: 'Sem loja definida' });

  const pessoas = await equipeVisivel(me, company);
  if (pessoas.length <= 1 && !GESTOR.includes(me.access_level)) {
    return res.status(403).json({ error: 'A análise de equipe é para quem lidera pessoas.' });
  }

  const { de, ate } = periodoDe(req.query);
  try {
    const dados = await coletar(company, pessoas.map(p => p.id), de, ate);
    const analises = pessoas.map(p => analisarPessoa(p, dados, de, ate));
    registrarLog('ver_desempenho_equipe', 'profiles', 'sucesso', { company, user_id: me.id, depois: { pessoas: pessoas.length, de, ate } });
    res.json({ ...analisarEquipe(analises, de, ate), loja: company, dimensoes: DIMENSOES, detalhes: analises });
  } catch (e) {
    registrarLog('ver_desempenho_equipe', 'profiles', 'erro', { company, user_id: me.id, rota: req.originalUrl, erro: e.message });
    res.status(500).json({ error: 'Não foi possível montar a análise da equipe.' });
  }
});

module.exports = router;
