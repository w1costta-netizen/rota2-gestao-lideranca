const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/team?user_id=
router.get('/', async (req, res) => {
  const { user_id, active } = req.query;
  let q = supabase.from('team_members').select('*').eq('user_id', user_id).order('name');
  if (active === 'true') q = q.eq('active', true);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/team
router.post('/', async (req, res) => {
  const { user_id, matricula, name, role, sector } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id e name são obrigatórios' });
  const { data, error } = await supabase.from('team_members')
    .insert({ user_id, matricula, name: name.toUpperCase(), role, sector })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/team/:id
router.put('/:id', async (req, res) => {
  const { matricula, name, role, sector, active } = req.body;
  const { data, error } = await supabase.from('team_members')
    .update({ matricula, name: name?.toUpperCase(), role, sector, active })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/team/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('team_members').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
