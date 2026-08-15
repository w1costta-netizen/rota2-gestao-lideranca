const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

const TOTAL_TREINAMENTOS = 7;
const TOTAL_ETAPAS = 5;

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name, avatar_url, role').eq('id', id).single();
  return data;
}
const canManageTeam = p => p && ['admin', 'supervisor', 'master'].includes(p.access_level);

// GET /api/produtividade/progresso?requester_id= — progresso do próprio colaborador
router.get('/progresso', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase.from('progresso_produtividade')
    .select('treinamento_id, etapa_atual, total_etapas, concluido, concluido_em, ultimo_acesso')
    .eq('colaborador_id', requester_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/produtividade/progresso — salva/atualiza o avanço num treinamento
router.post('/progresso', async (req, res) => {
  const { requester_id, treinamento_id, etapa_atual, concluido } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!treinamento_id) return res.status(400).json({ error: 'treinamento_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const updates = {
    colaborador_id: requester_id,
    company: me.company,
    treinamento_id,
    etapa_atual: etapa_atual ?? 0,
    total_etapas: TOTAL_ETAPAS,
    ultimo_acesso: new Date().toISOString(),
  };
  if (concluido) {
    updates.concluido    = true;
    updates.concluido_em = new Date().toISOString();
  }

  const { data, error } = await supabase.from('progresso_produtividade')
    .upsert(updates, { onConflict: 'colaborador_id,treinamento_id' })
    .select().single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'atualizar_progresso_produtividade', tabela: 'progresso_produtividade', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  if (concluido) {
    logAction({ company: me.company, user_id: requester_id, acao: 'concluir_treinamento_produtividade', tabela: 'progresso_produtividade', depois: { treinamento_id } });
  }
  res.json(data);
});

// GET /api/produtividade/team?requester_id=&company= — painel do líder (admin/supervisor/master)
router.get('/team', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !canManageTeam(me)) return res.status(403).json({ error: 'Acesso negado' });

  const targetCompany = me.access_level === 'master' ? (queryCompany || me.company) : me.company;
  if (!targetCompany) return res.json([]);

  const { data: users, error: uErr } = await supabase.from('profiles')
    .select('id, full_name, role, avatar_url, active')
    .eq('company', targetCompany)
    .eq('active', true)
    .order('full_name');
  if (uErr) return res.status(500).json({ error: uErr.message });

  const ids = (users || []).map(u => u.id);
  let progresso = [];
  if (ids.length) {
    const { data } = await supabase.from('progresso_produtividade')
      .select('colaborador_id, treinamento_id, etapa_atual, total_etapas, concluido, concluido_em, ultimo_acesso')
      .in('colaborador_id', ids);
    progresso = data || [];
  }

  const porUsuario = {};
  progresso.forEach(p => {
    if (!porUsuario[p.colaborador_id]) porUsuario[p.colaborador_id] = [];
    porUsuario[p.colaborador_id].push(p);
  });

  const result = (users || []).map(u => {
    const rows = porUsuario[u.id] || [];
    const somaPct = rows.reduce((acc, r) => acc + Math.min((r.etapa_atual || 0) / (r.total_etapas || TOTAL_ETAPAS), 1), 0);
    const pctGeral = Math.round((somaPct / TOTAL_TREINAMENTOS) * 100);
    const ultimoAcesso = rows.reduce((max, r) => (!max || (r.ultimo_acesso && r.ultimo_acesso > max)) ? r.ultimo_acesso : max, null);
    return {
      id: u.id,
      full_name: u.full_name,
      role: u.role,
      avatar_url: u.avatar_url,
      progresso: rows,
      pct_geral: pctGeral,
      ultimo_acesso: ultimoAcesso,
    };
  });

  res.json(result);
});

module.exports = router;
