const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor'].includes(p.access_level);

// GET /api/tarefas?requester_id=
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  let query = supabase
    .from('tarefas')
    .select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)')
    .eq('company', me.company)
    .order('created_at', { ascending: false });

  // Líderes veem só as suas
  if (!isManager(me)) query = query.eq('assigned_to', requester_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/tarefas
router.post('/', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, priority } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!title || !assigned_to) return res.status(400).json({ error: 'title e assigned_to obrigatórios' });

  const { data, error } = await supabase.from('tarefas').insert({
    company: me.company, title: title.trim(),
    description: description?.trim() || '',
    assigned_to, created_by: requester_id,
    due_date: due_date || null,
    priority: priority || 'normal',
  }).select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/tarefas/:id
router.put('/:id', async (req, res) => {
  const { requester_id, title, description, assigned_to, due_date, priority, status } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Acesso negado' });

  const updates = { updated_at: new Date().toISOString() };
  // Líder só pode atualizar status
  if (isManager(me)) {
    if (title)       updates.title       = title.trim();
    if (description !== undefined) updates.description = description?.trim() || '';
    if (assigned_to) updates.assigned_to = assigned_to;
    if (due_date !== undefined) updates.due_date = due_date || null;
    if (priority)    updates.priority    = priority;
  }
  if (status) updates.status = status;

  const { data, error } = await supabase.from('tarefas').update(updates).eq('id', req.params.id)
    .select('*, assigned:assigned_to(id,full_name,sector), creator:created_by(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/tarefas/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  const { error } = await supabase.from('tarefas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
