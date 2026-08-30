const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { sendPushToUsers } = require('../lib/push');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor','master'].includes(p.access_level);

// GET /api/mural?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;
  if (me.access_level === 'master' && !targetCompany) return res.json([]);

  const { data, error } = await supabase
    .from('mural')
    .select('*, creator:created_by(full_name)')
    .eq('company', targetCompany)
    .order('sort_order')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Marca quais já foram visualizados por quem pediu a lista
  let lidos = [];
  if (data?.length) {
    const { data: l } = await supabase
      .from('mural_lidos')
      .select('mural_id')
      .eq('user_id', requester_id)
      .in('mural_id', data.map(m => m.id));
    lidos = (l || []).map(x => x.mural_id);
  }

  res.json((data || []).map(m => ({ ...m, lido: lidos.includes(m.id) })));
});

// POST /api/mural
router.post('/', async (req, res) => {
  const { requester_id, title, content, category, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!title || !content) return res.status(400).json({ error: 'title e content obrigatórios' });
  const targetCompany = me.access_level === 'master' ? bodyCompany : me.company;

  const { data, error } = await supabase.from('mural').insert({
    company: targetCompany,
    title: title.trim(),
    content: content.trim(),
    category: category || 'geral',
    created_by: requester_id,
  }).select('*, creator:created_by(full_name)').single();

  if (error) {
    logError({ company: targetCompany, user_id: requester_id, acao: 'criar_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: targetCompany, user_id: requester_id, acao: 'criar_mural', tabela: 'mural', depois: { id: data.id, title: data.title } });
  res.json(data);
});

// PUT /api/mural/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, content, category, sort_order } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: existente } = await supabase.from('mural').select('created_by').eq('id', req.params.id).single();
  const isOwner = existente?.created_by === requester_id;
  if (!isOwner && !isManager(me))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode editar' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined)      updates.title      = title.trim();
  if (content !== undefined)    updates.content    = content.trim();
  if (category !== undefined)   updates.category   = category;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await supabase.from('mural').update(updates).eq('id', req.params.id)
    .select('*, creator:created_by(full_name)').single();
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'editar_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'editar_mural', tabela: 'mural', depois: updates });
  res.json(data);
});

// DELETE /api/mural/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data: item } = await supabase.from('mural').select('title, created_by').eq('id', req.params.id).single();
  const isOwner = item?.created_by === requester_id;
  if (!isOwner && !isManager(me))
    return res.status(403).json({ error: 'Acesso negado — só quem criou ou um gestor pode excluir' });
  const { error } = await supabase.from('mural').delete().eq('id', req.params.id);
  if (error) {
    logError({ company: me.company, user_id: requester_id, acao: 'excluir_mural', tabela: 'mural', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: requester_id, acao: 'excluir_mural', tabela: 'mural', antes: { title: item?.title } });
  res.json({ ok: true });
});

// POST /api/mural/:id/lido — marca como visualizado
router.post('/:id/lido', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { error } = await supabase.from('mural_lidos')
    .upsert({ mural_id: req.params.id, user_id }, { onConflict: 'mural_id,user_id' });
  if (error) {
    registrarLog('marcar_mural_lido', 'mural_lidos', 'erro', { user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('marcar_mural_lido', 'mural_lidos', 'sucesso', { user_id, depois: { mural_id: req.params.id } });
  res.json({ ok: true });
});

// ── Comentários do mural ─────────────────────────────────────────────
// Qualquer pessoa da empresa pode comentar; editar e apagar, só o autor
// (ou um gestor, para poder moderar conteúdo impróprio).

// GET /api/mural/:id/comentarios?requester_id=
router.get('/:id/comentarios', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase
    .from('mural_comentarios')
    .select('*, author:user_id(full_name, avatar_url)')
    .eq('mural_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/mural/:id/comentarios
router.post('/:id/comentarios', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Só comenta em card da própria empresa
  const { data: card } = await supabase.from('mural').select('company, title, created_by').eq('id', req.params.id).single();
  if (!card) return res.status(404).json({ error: 'Card não encontrado' });
  if (me.access_level !== 'master' && card.company !== me.company) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase.from('mural_comentarios')
    .insert({ mural_id: req.params.id, user_id: requester_id, text: text.trim() })
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('comentar_mural', 'mural_comentarios', 'erro', { company: card.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('comentar_mural', 'mural_comentarios', 'sucesso', { company: card.company, user_id: requester_id, depois: { card: card.title } });

  // Avisa quem publicou o card — sem isso ele só descobre o comentário se
  // voltar na tela por acaso. Não notifica quem comentou no próprio card.
  if (card.created_by && card.created_by !== requester_id) {
    sendPushToUsers([card.created_by], {
      title: `💬 ${me.full_name || 'Alguém'} comentou no mural`,
      body: `${card.title}: ${text.trim().slice(0, 60)}`,
      page: 'mural',
    }).catch(() => {});
  }

  res.json(data);
});

// PUT /api/mural/comentarios/:cid — só o autor edita
router.put('/comentarios/:cid', async (req, res) => {
  const { requester_id, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text obrigatório' });
  const { data: c } = await supabase.from('mural_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id) return res.status(403).json({ error: 'Só o autor pode editar' });

  const { data, error } = await supabase.from('mural_comentarios')
    .update({ text: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', req.params.cid)
    .select('*, author:user_id(full_name, avatar_url)').single();
  if (error) {
    registrarLog('editar_comentario_mural', 'mural_comentarios', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_comentario_mural', 'mural_comentarios', 'sucesso', { user_id: requester_id, depois: { id: req.params.cid } });
  res.json(data);
});

// DELETE /api/mural/comentarios/:cid — o autor ou um gestor (moderação)
router.delete('/comentarios/:cid', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  const { data: c } = await supabase.from('mural_comentarios').select('user_id').eq('id', req.params.cid).single();
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (c.user_id !== requester_id && !isManager(me)) {
    return res.status(403).json({ error: 'Só o autor ou um gestor pode apagar' });
  }

  const { error } = await supabase.from('mural_comentarios').delete().eq('id', req.params.cid);
  if (error) {
    registrarLog('excluir_comentario_mural', 'mural_comentarios', 'erro', { company: me?.company, user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_comentario_mural', 'mural_comentarios', 'sucesso', { company: me?.company, user_id: requester_id, antes: { id: req.params.cid } });
  res.json({ ok: true });
});

// GET /api/mural/:id/leituras — quem visualizou e quem não (admin/supervisor/master)
router.get('/:id/leituras', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: item } = await supabase.from('mural').select('company').eq('id', req.params.id).single();
  if (!item) return res.status(404).json({ error: 'Card não encontrado' });

  const targetCompany = me.access_level === 'master' ? item.company : me.company;

  const { data: todos } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('company', targetCompany)
    .eq('active', true)
    .order('full_name');

  const { data: lidos } = await supabase
    .from('mural_lidos')
    .select('user_id, read_at')
    .eq('mural_id', req.params.id);

  const lidosMap = {};
  (lidos || []).forEach(l => { lidosMap[l.user_id] = l.read_at; });

  const leram    = (todos || []).filter(u => lidosMap[u.id]).map(u => ({ ...u, read_at: lidosMap[u.id] }));
  const nao_leram = (todos || []).filter(u => !lidosMap[u.id]);

  res.json({ leram, nao_leram });
});

module.exports = router;
