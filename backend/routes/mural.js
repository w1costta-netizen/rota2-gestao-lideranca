const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor'].includes(p.access_level);

// GET /api/mural?requester_id=
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('mural')
    .select('*, creator:created_by(full_name)')
    .eq('company', me.company)
    .order('sort_order')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/mural
router.post('/', async (req, res) => {
  const { requester_id, title, content, category } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!title || !content) return res.status(400).json({ error: 'title e content obrigatórios' });

  const { data, error } = await supabase.from('mural').insert({
    company: me.company,
    title: title.trim(),
    content: content.trim(),
    category: category || 'geral',
    created_by: requester_id,
  }).select('*, creator:created_by(full_name)').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/mural/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, content, category, sort_order } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined)      updates.title      = title.trim();
  if (content !== undefined)    updates.content    = content.trim();
  if (category !== undefined)   updates.category   = category;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { data, error } = await supabase.from('mural').update(updates).eq('id', req.params.id)
    .select('*, creator:created_by(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/mural/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  const { error } = await supabase.from('mural').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
