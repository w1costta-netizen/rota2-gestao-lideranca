const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');

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

// POST /api/comunicados — cria comunicado (qualquer pessoa da empresa)
router.post('/', async (req, res) => {
  const { requester_id, title, body, priority, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
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

  res.json(data);
});

// PUT /api/comunicados/:id — edita
router.put('/:id', async (req, res) => {
  const { requester_id, title, body, priority } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: existente } = await supabase.from('comunicados').select('created_by').eq('id', req.params.id).single();
  const isOwner = existente?.created_by === requester_id;
  if (!isOwner && !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode editar' });

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
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: com } = await supabase.from('comunicados').select('title, created_by').eq('id', req.params.id).single();
  const isOwner = com?.created_by === requester_id;
  if (!isOwner && !['admin', 'supervisor', 'master'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode excluir' });

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
  if (error) {
    registrarLog('marcar_comunicado_lido', 'comunicados_lidos', 'erro', { user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('marcar_comunicado_lido', 'comunicados_lidos', 'sucesso', { user_id, depois: { comunicado_id: req.params.id } });
  res.json({ ok: true });
});

// ── Comentários dos comunicados ──────────────────────────────────────
// Qualquer pessoa da empresa pode comentar; editar e apagar, só o autor
// (ou um gestor, para poder moderar conteúdo impróprio).

// GET /api/comunicados/:id/comentarios?requester_id=
router.get('/:id/comentarios', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase
    .from('comunicado_comentarios')
    .select('*, author:user_id(full_name, avatar_url)')
    .eq('comunicado_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/comunicados/:id/comentarios
router.post('/:id/comentarios', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Só comenta em comunicado da própria empresa
  const { data: com } = await supabase.from('comunicados').select('company, title, created_by').eq('id', req.params.id).single();
  if (!com) return res.status(404).json({ error: 'Comunicado não encontrado' });
  if (me.access_level !== 'master' && com.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase.from('comunicado_comentarios')
    .insert({ comunicado_id: req.params.id, user_id: requester_id, text: text.trim() })
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('comentar_comunicado', 'comunicado_comentarios', 'erro', { company: com.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('comentar_comunicado', 'comunicado_comentarios', 'sucesso', { company: com.company, user_id: requester_id, depois: { comunicado: com.title } });

  res.json(data);
});

// PUT /api/comunicados/comentarios/:cid — só o autor edita
router.put('/comentarios/:cid', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const { data: c } = await supabase.from('comunicado_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode editar' });

  const { data, error } = await supabase.from('comunicado_comentarios')
    .update({ text: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', req.params.cid)
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('editar_comentario_comunicado', 'comunicado_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_comentario_comunicado', 'comunicado_comentarios', 'sucesso', { user_id: requester_id, depois: { id: req.params.cid } });
  res.json(data);
});

// DELETE /api/comunicados/comentarios/:cid — o autor ou um gestor (moderação)
router.delete('/comentarios/:cid', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  const ehGestor = me && ['admin', 'supervisor', 'master'].includes(me.access_level);
  const { data: c } = await supabase.from('comunicado_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id && !ehGestor) {
    return res.status(403).json({ error: 'Só o autor ou um gestor pode apagar' });
  }

  const { error } = await supabase.from('comunicado_comentarios').delete().eq('id', req.params.cid);
  if (error) {
    registrarLog('excluir_comentario_comunicado', 'comunicado_comentarios', 'erro', { company: me?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_comentario_comunicado', 'comunicado_comentarios', 'sucesso', { company: me?.company, user_id: requester_id, antes: { id: req.params.cid } });
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
