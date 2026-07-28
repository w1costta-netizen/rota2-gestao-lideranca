const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

// POST /api/reacoes/toggle
// body: { tipo, item_id, user_id, emoji }
router.post('/toggle', async (req, res) => {
  const { tipo, item_id, user_id, emoji } = req.body;
  if (!tipo || !item_id || !user_id || !emoji)
    return res.status(400).json({ error: 'tipo, item_id, user_id e emoji são obrigatórios' });

  // Verifica se já existe
  const { data: existing } = await supabase
    .from('reacoes')
    .select('id')
    .eq('tipo', tipo)
    .eq('item_id', item_id)
    .eq('user_id', user_id)
    .eq('emoji', emoji)
    .single();

  if (existing) {
    // Remover
    await supabase.from('reacoes').delete().eq('id', existing.id);
    return res.json({ action: 'removed' });
  } else {
    // Adicionar
    await supabase.from('reacoes').insert({ tipo, item_id, user_id, emoji });
    return res.json({ action: 'added' });
  }
});

// GET /api/reacoes?tipo=mural&item_ids=id1,id2&user_id=xxx
// Retorna { [item_id]: { emoji: { count, mine } } }
router.get('/', async (req, res) => {
  const { tipo, item_ids, user_id } = req.query;
  if (!tipo || !item_ids) return res.json({});

  const ids = item_ids.split(',').filter(Boolean);
  if (!ids.length) return res.json({});

  const { data, error } = await supabase
    .from('reacoes')
    .select('item_id, user_id, emoji')
    .eq('tipo', tipo)
    .in('item_id', ids);

  if (error) return res.status(500).json({ error: error.message });

  // Agrupa por item_id → emoji → { count, mine }
  const result = {};
  for (const row of data || []) {
    if (!result[row.item_id]) result[row.item_id] = {};
    if (!result[row.item_id][row.emoji]) result[row.item_id][row.emoji] = { count: 0, mine: false };
    result[row.item_id][row.emoji].count++;
    if (row.user_id === user_id) result[row.item_id][row.emoji].mine = true;
  }

  res.json(result);
});

module.exports = router;
