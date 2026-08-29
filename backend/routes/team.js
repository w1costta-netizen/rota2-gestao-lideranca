const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

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
  const { data: antes } = await supabase.from('team_members').select('name, role, sector, active, user_id').eq('id', req.params.id).maybeSingle();
  const { data, error } = await supabase.from('team_members')
    .update({ matricula, name: name?.toUpperCase(), role, sector, active })
    .eq('id', req.params.id).select().single();
  if (error) {
    logError({ user_id: antes?.user_id, acao: 'editar_membro_equipe', tabela: 'team_members', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({
    user_id: data.user_id, acao: 'editar_membro_equipe', tabela: 'team_members',
    antes: { name: antes?.name, role: antes?.role, sector: antes?.sector, active: antes?.active },
    depois: { name: data.name, role: data.role, sector: data.sector, active: data.active },
  });
  res.json(data);
});

// DELETE /api/team/:id
router.delete('/:id', async (req, res) => {
  const { data: antes } = await supabase.from('team_members').select('name, sector, user_id').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('team_members').delete().eq('id', req.params.id);
  if (error) {
    logError({ user_id: antes?.user_id, acao: 'excluir_membro_equipe', tabela: 'team_members', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ user_id: antes?.user_id, acao: 'excluir_membro_equipe', tabela: 'team_members', antes: { name: antes?.name, sector: antes?.sector } });
  res.json({ ok: true });
});

module.exports = router;
