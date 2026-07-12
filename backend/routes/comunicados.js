const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToTargets } = require('../lib/push');

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}

// GET /api/comunicados?requester_id=
router.get('/', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('comunicados')
    .select('*, profiles:created_by(full_name)')
    .eq('company', me.company)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Busca IDs já lidos pelo usuário
  const ids = (data || []).map(c => c.id);
  let lidos = [];
  if (ids.length > 0) {
    const { data: l } = await supabase
      .from('comunicados_lidos')
      .select('comunicado_id')
      .eq('user_id', requester_id)
      .in('comunicado_id', ids);
    lidos = (l || []).map(x => x.comunicado_id);
  }

  const result = (data || []).map(c => ({ ...c, lido: lidos.includes(c.id) }));
  res.json(result);
});

// POST /api/comunicados — cria comunicado (admin/supervisor)
router.post('/', async (req, res) => {
  const { requester_id, title, body, priority } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });
  if (!title || !body) return res.status(400).json({ error: 'title e body obrigatórios' });

  const { data, error } = await supabase.from('comunicados').insert({
    company: me.company,
    title: title.trim(),
    body: body.trim(),
    priority: priority || 'normal',
    created_by: requester_id,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Push notification para todos
  try {
    await sendPushToTargets({
      targetType: 'geral',
      company: me.company,
      payload: {
        title: priority === 'urgente' ? `🚨 ${title}` : `📢 ${title}`,
        body: body.slice(0, 100),
      },
    });
  } catch (e) { console.warn('Push comunicado:', e.message); }

  res.json(data);
});

// PUT /api/comunicados/:id — edita
router.put('/:id', async (req, res) => {
  const { requester_id, title, body, priority } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (title)    updates.title    = title.trim();
  if (body)     updates.body     = body.trim();
  if (priority) updates.priority = priority;

  const { data, error } = await supabase.from('comunicados').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/comunicados/:id — desativa
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me || !['admin', 'supervisor'].includes(me.access_level))
    return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('comunicados').update({ active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/comunicados/:id/lido — marca como lido
router.post('/:id/lido', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { error } = await supabase.from('comunicados_lidos')
    .upsert({ comunicado_id: req.params.id, user_id }, { onConflict: 'comunicado_id,user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
