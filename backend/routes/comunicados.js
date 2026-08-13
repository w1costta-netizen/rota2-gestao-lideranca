const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToTargets } = require('../lib/push');
const { logAction, logError } = require('../lib/auditLog');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}

// GET /api/comunicados?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  const { data, error } = await supabase
    .from('comunicados')
    .select('*, profiles:created_by(full_name)')
    .eq('company', targetCompany)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Busca IDs já lidos pelo usuário
  const ids = (data || []).map(c => c.id);
  let lidos = [];
  if (ids.length > 0) {
    const { data: l } = await supabase
      .from('comunicados_lidos')
      .select('comunicado_id')
      .eq('user_id', requester_id)
      .in('comunicado_id', ids);
    lidos = (l || []).map(x => x.comunicado_id);
  }

  const result = (data || []).map(c => ({ ...c, lido: lidos.includes(c.id) }));
  res.json(result);
});

// POST /api/comunicados — cria comunicado (admin/supervisor)
router.post('/', async (req, res) => {
  const { requester_id, title, body, priority, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });
  if (!title || !body) return res.status(400).json({ error: 'title e body obrigatórios' });
  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;

  const { data, error } = await supabase.from('comunicados').insert({
    company: targetCompany,
    title: title.trim(),
    body: body.trim(),
    priority: priority || 'normal',
    created_by: requester_id,
  }).select().single();

  if (error) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_comunicado', tabela: 'comunicados', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_comunicado', tabela: 'comunicados', depois: { id: data.id, title: data.title, priority: data.priority } });

  // Push notification para todos
  try {
    await sendPushToTargets({
      targetType: 'geral',
      company: targetCompany,
      payload: {
        title: priority === 'urgente' ? `🚨 ${title}` : `📢 ${title}`,
        body: body.slice(0, 100),
      },
    });
  } catch (e) { console.warn('Push comunicado:', e.message); }

  res.json(data);
});

// PUT /api/comunicados/:id — edita
router.put('/:id', async (req, res) => {
  const { requester_id, title, body, priority } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (title)    updates.title    = title.trim();
  if (body)     updates.body     = body.trim();
  if (priority) updates.priority = priority;

  const { data, error } = await supabase.from('comunicados').update(updates).eq('id', req.params.id).select().single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'editar_comunicado', tabela: 'comunicados', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'editar_comunicado', tabela: 'comunicados', depois: updates });
  res.json(data);
});

// DELETE /api/comunicados/:id — desativa
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const { data: com } = await supabase.from('comunicados').select('title').eq('id', req.params.id).single();
  const { error } = await supabase.from('comunicados').update({ active: false }).eq('id', req.params.id);
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'excluir_comunicado', tabela: 'comunicados', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'excluir_comunicado', tabela: 'comunicados', antes: { title: com?.title } });
  res.json({ ok: true });
});

// POST /api/comunicados/:id/lido — marca como lido
router.post('/:id/lido', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { error } = await supabase.from('comunicados_lidos')
    .upsert({ comunicado_id: req.params.id, user_id }, { onConflict: 'comunicado_id,user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/comunicados/:id/leituras — quem leu e quem não leu (admin/supervisor)
router.get('/:id/leituras', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  // Busca comunicado para pegar a empresa
  const { data: comunicado } = await supabase
    .from('comunicados').select('company').eq('id', req.params.id).single();
  if (!comunicado) return res.status(404).json({ error: 'Comunicado não encontrado' });

  const targetCompany = me.access_level === 'master' ? comunicado.company : me.company;

  // Todos os usuários ativos da empresa
  const { data: todos } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('company', targetCompany)
    .eq('active', true)
    .order('full_name');

  // Quem leu + quando
  const { data: lidos } = await supabase
    .from('comunicados_lidos')
    .select('user_id, read_at')
    .eq('comunicado_id', req.params.id);

  const lidosMap = {};
  (lidos || []).forEach(l => { lidosMap[l.user_id] = l.read_at; });

  const leram   = (todos || []).filter(u => lidosMap[u.id]).map(u => ({ ...u, read_at: lidosMap[u.id] }));
  const naoLeram = (todos || []).filter(u => !lidosMap[u.id]);

  res.json({ leram, nao_leram: naoLeram });
});

module.exports = router;
