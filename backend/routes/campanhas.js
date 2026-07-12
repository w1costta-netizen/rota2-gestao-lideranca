const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor'].includes(p.access_level);

// ── CAMPANHAS ─────────────────────────────────────────────────────

// GET /api/campanhas?requester_id=
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('campanhas')
    .select(`*, creator:created_by(full_name),
      campanha_itens(id),
      campanha_evidencias(id, item_id)`)
    .eq('company', me.company)
    .neq('status', 'arquivada')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campanhas
router.post('/', async (req, res) => {
  const { requester_id, titulo, tipo, validade_ini, validade_fim } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase.from('campanhas').insert({
    company: me.company, titulo, tipo: tipo || 'fds',
    validade_ini, validade_fim, created_by: requester_id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/campanhas/:id
router.put('/:id', async (req, res) => {
  const { requester_id, status, titulo, validade_ini, validade_fim } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (titulo)       updates.titulo       = titulo;
  if (status)       updates.status       = status;
  if (validade_ini) updates.validade_ini = validade_ini;
  if (validade_fim) updates.validade_fim = validade_fim;

  const { data, error } = await supabase.from('campanhas').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  await supabase.from('campanhas').update({ status: 'arquivada' }).eq('id', req.params.id);
  res.json({ ok: true });
});

// ── ITENS ─────────────────────────────────────────────────────────

// GET /api/campanhas/:id/itens
router.get('/:id/itens', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase
    .from('campanha_itens')
    .select(`*, campanha_evidencias(id, foto_url, validado, obs, created_at, user:user_id(full_name))`)
    .eq('campanha_id', req.params.id)
    .order('ordem');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campanhas/:id/itens
router.post('/:id/itens', async (req, res) => {
  const { requester_id, itens } = req.body; // itens = [{descricao, preco, categoria, ordem}]
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const rows = itens.map((item, i) => ({
    campanha_id: req.params.id,
    descricao: item.descricao,
    preco: item.preco || '',
    categoria: item.categoria || '',
    ordem: item.ordem ?? i,
  }));

  const { data, error } = await supabase.from('campanha_itens').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/campanhas/itens/:itemId
router.put('/itens/:itemId', async (req, res) => {
  const { requester_id, descricao, preco, categoria } = req.body;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase.from('campanha_itens')
    .update({ descricao, preco, categoria })
    .eq('id', req.params.itemId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/itens/:itemId
router.delete('/itens/:itemId', async (req, res) => {
  const { requester_id } = req.query;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  await supabase.from('campanha_itens').delete().eq('id', req.params.itemId);
  res.json({ ok: true });
});

// ── EVIDÊNCIAS ────────────────────────────────────────────────────

// POST /api/campanhas/evidencias
router.post('/evidencias', async (req, res) => {
  const { requester_id, item_id, campanha_id, foto_url, obs } = req.body;
  if (!requester_id || !item_id || !foto_url) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  // Remove evidência anterior do mesmo item (substitui)
  await supabase.from('campanha_evidencias').delete().eq('item_id', item_id).eq('user_id', requester_id);

  const { data, error } = await supabase.from('campanha_evidencias').insert({
    item_id, campanha_id, user_id: requester_id, foto_url, obs: obs || '',
  }).select('*, user:user_id(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/evidencias/:evId
router.delete('/evidencias/:evId', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  await supabase.from('campanha_evidencias').delete().eq('id', req.params.evId);
  res.json({ ok: true });
});

// GET /api/campanhas/:id/relatorio — dados completos para PDF
router.get('/:id/relatorio', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: campanha } = await supabase.from('campanhas').select('*, creator:created_by(full_name)').eq('id', req.params.id).single();
  const { data: itens } = await supabase.from('campanha_itens')
    .select('*, campanha_evidencias(id, foto_url, obs, created_at, user:user_id(full_name))')
    .eq('campanha_id', req.params.id).order('ordem');

  res.json({ campanha, itens: itens || [] });
});

module.exports = router;
