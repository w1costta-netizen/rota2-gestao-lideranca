const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}

// GET /api/relatorios?requester_id=
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  let query = supabase
    .from('relatorios_fotograficos')
    .select('*, creator:created_by(full_name), fotos:relatorio_fotos(id, photo_url, order_index)')
    .eq('company', me.company)
    .order('created_at', { ascending: false });

  // Não-admin vê apenas os próprios relatórios
  if (!['admin', 'supervisor'].includes(me.access_level)) {
    query = query.eq('created_by', requester_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/relatorios/:id?requester_id=
router.get('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('relatorios_fotograficos')
    .select('*, creator:created_by(full_name), fotos:relatorio_fotos(*)')
    .eq('id', req.params.id)
    .order('order_index', { referencedTable: 'relatorio_fotos', ascending: true })
    .single();

  if (error) return res.status(404).json({ error: 'Relatório não encontrado' });
  res.json(data);
});

// POST /api/relatorios
router.post('/', async (req, res) => {
  const { requester_id, title, description } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

  const { data, error } = await supabase.from('relatorios_fotograficos').insert({
    company: me.company,
    created_by: requester_id,
    title: title.trim(),
    description: description?.trim() || '',
    status: 'rascunho',
  }).select('*, creator:created_by(full_name)').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/relatorios/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, description, status, pdf_url } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: rel } = await supabase.from('relatorios_fotograficos').select('created_by').eq('id', req.params.id).single();
  if (!rel) return res.status(404).json({ error: 'Não encontrado' });
  const isOwner = rel.created_by === requester_id;
  if (!isOwner && !['admin', 'supervisor'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined)       updates.title       = title.trim();
  if (description !== undefined) updates.description = description?.trim() || '';
  if (status !== undefined)      updates.status      = status;
  if (pdf_url !== undefined)     updates.pdf_url     = pdf_url;

  const { data, error } = await supabase.from('relatorios_fotograficos').update(updates).eq('id', req.params.id)
    .select('*, creator:created_by(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/relatorios/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const { data: rel } = await supabase.from('relatorios_fotograficos').select('created_by').eq('id', req.params.id).single();
  if (!rel) return res.status(404).json({ error: 'Não encontrado' });
  const isOwner = rel.created_by === requester_id;
  if (!isOwner && !['admin', 'supervisor'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('relatorios_fotograficos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/relatorios/:id/fotos
router.post('/:id/fotos', async (req, res) => {
  const { requester_id, photo_url, caption, order_index, annotations } = req.body;
  if (!requester_id || !photo_url) return res.status(400).json({ error: 'requester_id e photo_url obrigatórios' });

  const { data, error } = await supabase.from('relatorio_fotos').insert({
    relatorio_id: req.params.id,
    photo_url,
    caption: caption || '',
    order_index: order_index ?? 0,
    annotations: annotations || null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/relatorios/fotos/:fotoId
router.put('/fotos/:fotoId', async (req, res) => {
  const { caption, annotations, order_index } = req.body;
  const updates = {};
  if (caption !== undefined)      updates.caption      = caption;
  if (annotations !== undefined)  updates.annotations  = annotations;
  if (order_index !== undefined)  updates.order_index  = order_index;

  const { data, error } = await supabase.from('relatorio_fotos').update(updates).eq('id', req.params.fotoId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/relatorios/fotos/:fotoId
router.delete('/fotos/:fotoId', async (req, res) => {
  const { error } = await supabase.from('relatorio_fotos').delete().eq('id', req.params.fotoId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
