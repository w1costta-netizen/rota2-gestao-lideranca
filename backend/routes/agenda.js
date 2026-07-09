const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

router.get('/', async (req, res) => {
  const { week_start } = req.query;
  let query = supabase.from('agenda_items').select('*').order('day_of_week').order('time');
  if (week_start) query = query.eq('week_start', week_start);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/leader/:id', async (req, res) => {
  const { week_start } = req.query;

  const { data: leader, error: le } = await supabase.from('leaders').select('*').eq('id', req.params.id).single();
  if (le) return res.status(404).json({ error: 'Líder não encontrado' });

  const workDays = leader.work_days;

  const { data: items, error: ie } = await supabase.from('agenda_items')
    .select('*').eq('week_start', week_start).order('day_of_week').order('time');
  if (ie) return res.status(500).json({ error: ie.message });

  const filtered = items.filter(item => {
    if (!workDays.includes(item.day_of_week)) return false;
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return item.target_value === leader.sector;
    if (item.target_type === 'lider') return item.target_value === String(leader.id);
    return false;
  });

  res.json({ leader, items: filtered });
});

router.post('/', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time } = req.body;
  if (!title || !week_start || !target_type || !day_of_week)
    return res.status(400).json({ error: 'Campos obrigatórios: title, week_start, target_type, day_of_week' });

  const { data, error } = await supabase.from('agenda_items')
    .insert({ title, description: description || '', week_start, target_type, target_value: target_value || '', day_of_week, time: time || '' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time } = req.body;
  const { data, error } = await supabase.from('agenda_items')
    .update({ title, description: description || '', week_start, target_type, target_value: target_value || '', day_of_week, time: time || '' })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('agenda_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
