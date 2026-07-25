const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

async function requireMaster(req, res) {
  const id = req.body?.requester_id || req.query?.requester_id;
  if (!id) { res.status(401).json({ error: 'requester_id obrigatório' }); return null; }
  const { data } = await supabase.from('profiles').select('access_level').eq('id', id).single();
  if (!data || data.access_level !== 'master') { res.status(403).json({ error: 'Acesso negado' }); return null; }
  return data;
}

// GET /api/stores — lista todas as lojas (master)
router.get('/', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { data: stores, error } = await supabase
    .from('stores')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  // Enriquecer com contagem de usuários por loja
  const { data: profiles } = await supabase
    .from('profiles')
    .select('company, active');

  const counts = {};
  (profiles || []).forEach(p => {
    if (!counts[p.company]) counts[p.company] = { total: 0, active: 0 };
    counts[p.company].total++;
    if (p.active) counts[p.company].active++;
  });

  const result = (stores || []).map(s => ({
    ...s,
    user_count:  counts[s.name]?.total  || 0,
    active_count: counts[s.name]?.active || 0,
  }));

  res.json(result);
});

// POST /api/stores/master — master cria loja já ativa
router.post('/master', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;
  const { name, city } = req.body;
  if (!name) return res.status(400).json({ error: 'name obrigatório' });

  const { data, error } = await supabase.from('stores').insert({
    name, city: city || null, active: true, approved_by: req.body.requester_id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/stores — gerente cria pedido de loja
router.post('/', async (req, res) => {
  const { requester_id, name, city } = req.body;
  if (!requester_id || !name) return res.status(400).json({ error: 'requester_id e name obrigatórios' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Cria a loja como pendente
  const { data, error } = await supabase.from('stores').insert({
    name, city: city || null, active: false, created_by: requester_id
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Atualiza o company do gerente para o nome da loja
  await supabase.from('profiles').update({ company: name }).eq('id', requester_id);

  res.json(data);
});

// PUT /api/stores/:id/approve — master aprova loja
router.put('/:id/approve', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { data, error } = await supabase
    .from('stores')
    .update({ active: true, approved_by: req.body.requester_id })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Ativa o gerente que criou a loja como admin dela
  if (data.created_by) {
    await supabase.from('profiles').update({ active: true, access_level: 'admin' }).eq('id', data.created_by);
  }

  res.json(data);
});

// PUT /api/stores/:id/disable — master desativa loja
router.put('/:id/disable', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;

  const { data, error } = await supabase
    .from('stores')
    .update({ active: false })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/stores/my — verifica se o usuário tem loja cadastrada
router.get('/my', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: profile } = await supabase.from('profiles').select('company').eq('id', requester_id).single();
  if (!profile?.company) return res.json(null);

  const { data } = await supabase.from('stores').select('*').eq('name', profile.company).maybeSingle();
  res.json(data || null);
});

// GET /api/stores/users?company= — master vê usuários de uma loja
router.get('/users', async (req, res) => {
  const me = await requireMaster(req, res);
  if (!me) return;
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, sector, access_level, active, created_at')
    .eq('company', company)
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
