const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

// GET /api/listas?requester_id= — lista as listas do usuário com itens
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data: listas, error } = await supabase
    .from('listas')
    .select('id, nome, emoji, ordem, created_at, lista_itens(id, texto, concluido, ordem, created_at)')
    .eq('user_id', requester_id)
    .order('ordem', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const result = (listas || []).map(l => ({
    ...l,
    itens: (l.lista_itens || []).sort((a, b) => a.ordem - b.ordem),
    lista_itens: undefined,
  }));
  res.json(result);
});

// POST /api/listas — cria uma nova lista
router.post('/', async (req, res) => {
  const { requester_id, nome, emoji } = req.body;
  if (!requester_id || !nome?.trim()) return res.status(400).json({ error: 'requester_id e nome obrigatórios' });

  const { count } = await supabase
    .from('listas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', requester_id);

  const { data, error } = await supabase
    .from('listas')
    .insert({ user_id: requester_id, nome: nome.trim(), emoji: emoji || '📝', ordem: count || 0 })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, itens: [] });
});

// PUT /api/listas/:id — renomeia/edita emoji
router.put('/:id', async (req, res) => {
  const { requester_id, nome, emoji } = req.body;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data: lista } = await supabase.from('listas').select('user_id').eq('id', req.params.id).single();
  if (!lista || lista.user_id !== requester_id) return res.status(403).json({ error: 'Acesso negado' });

  const patch = {};
  if (nome?.trim()) patch.nome = nome.trim();
  if (emoji) patch.emoji = emoji;

  const { data, error } = await supabase.from('listas').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/listas/:id?requester_id= — apaga a lista e os itens
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data: lista } = await supabase.from('listas').select('user_id').eq('id', req.params.id).single();
  if (!lista || lista.user_id !== requester_id) return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('listas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/listas/:id/itens — adiciona item à lista
router.post('/:id/itens', async (req, res) => {
  const { requester_id, texto } = req.body;
  if (!requester_id || !texto?.trim()) return res.status(400).json({ error: 'requester_id e texto obrigatórios' });

  const { data: lista } = await supabase.from('listas').select('user_id').eq('id', req.params.id).single();
  if (!lista || lista.user_id !== requester_id) return res.status(403).json({ error: 'Acesso negado' });

  const { count } = await supabase
    .from('lista_itens')
    .select('id', { count: 'exact', head: true })
    .eq('lista_id', req.params.id);

  const { data, error } = await supabase
    .from('lista_itens')
    .insert({ lista_id: req.params.id, texto: texto.trim(), ordem: count || 0 })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/itens/:id — marca/desmarca concluído ou edita o texto
router.put('/itens/:id', async (req, res) => {
  const { requester_id, texto, concluido } = req.body;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data: item } = await supabase
    .from('lista_itens')
    .select('id, listas!inner(user_id)')
    .eq('id', req.params.id)
    .single();
  if (!item || item.listas.user_id !== requester_id) return res.status(403).json({ error: 'Acesso negado' });

  const patch = {};
  if (typeof concluido === 'boolean') patch.concluido = concluido;
  if (texto?.trim()) patch.texto = texto.trim();

  const { data, error } = await supabase.from('lista_itens').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/itens/:id?requester_id= — remove item
router.delete('/itens/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(400).json({ error: 'requester_id obrigatório' });

  const { data: item } = await supabase
    .from('lista_itens')
    .select('id, listas!inner(user_id)')
    .eq('id', req.params.id)
    .single();
  if (!item || item.listas.user_id !== requester_id) return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('lista_itens').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
