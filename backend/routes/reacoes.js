const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction } = require('../lib/auditLog');

async function companyDoUsuario(user_id) {
  const { data } = await supabase.from('profiles').select('company').eq('id', user_id).maybeSingle();
  return data?.company || null;
}

// POST /api/reacoes/toggle
// Regra: 1 reação por usuário por item. Trocar emoji remove o anterior.
// body: { tipo, item_id, user_id, emoji }
router.post('/toggle', async (req, res) => {
  const { tipo, item_id, user_id, emoji } = req.body;
  if (!tipo || !item_id || !user_id || !emoji)
    return res.status(400).json({ error: 'tipo, item_id, user_id e emoji são obrigatórios' });

  // Busca qualquer reação existente desse usuário nesse item
  const { data: existing } = await supabase
    .from('reacoes')
    .select('id, emoji')
    .eq('tipo', tipo)
    .eq('item_id', item_id)
    .eq('user_id', user_id)
    .maybeSingle();

  const company = await companyDoUsuario(user_id);

  if (existing) {
    // Remove a reação atual
    await supabase.from('reacoes').delete().eq('id', existing.id);

    if (existing.emoji === emoji) {
      // Mesmo emoji → apenas remove (toggle off)
      logAction({ company, user_id, acao: 'remover_reacao', tabela: 'reacoes', antes: { tipo, item_id, emoji } });
      return res.json({ action: 'removed', old_emoji: emoji });
    } else {
      // Emoji diferente → remove o antigo e adiciona o novo
      await supabase.from('reacoes').insert({ tipo, item_id, user_id, emoji });
      logAction({ company, user_id, acao: 'reagir', tabela: 'reacoes', antes: { emoji: existing.emoji }, depois: { tipo, item_id, emoji } });
      return res.json({ action: 'changed', old_emoji: existing.emoji });
    }
  } else {
    // Nenhuma reação ainda → adiciona
    await supabase.from('reacoes').insert({ tipo, item_id, user_id, emoji });
    logAction({ company, user_id, acao: 'reagir', tabela: 'reacoes', depois: { tipo, item_id, emoji } });
    return res.json({ action: 'added' });
  }
});

// GET /api/reacoes/quem?tipo=mural&item_id=xxx&emoji=👍
// Retorna lista de nomes que reagiram com esse emoji
router.get('/quem', async (req, res) => {
  const { tipo, item_id, emoji } = req.query;
  if (!tipo || !item_id || !emoji) return res.json([]);

  const { data: rows } = await supabase
    .from('reacoes')
    .select('user_id')
    .eq('tipo', tipo)
    .eq('item_id', item_id)
    .eq('emoji', emoji);

  if (!rows || rows.length === 0) return res.json([]);

  const userIds = rows.map(r => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('full_name')
    .in('id', userIds);

  const nomes = (profiles || []).map(p => p.full_name).filter(Boolean);
  res.json(nomes);
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
