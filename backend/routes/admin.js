const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

// Verifica se o solicitante é admin da empresa
async function requireAdmin(req, res, next) {
  const { requester_id } = req.body || req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  req.adminCompany = me.company;
  next();
}

// GET /api/admin/users?requester_id=
router.get('/users', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, sector, access_level, permissions, phone, active, first_access, created_at')
    .eq('company', me.company)
    .neq('id', requester_id)
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/users — cria usuário e perfil
router.post('/users', async (req, res) => {
  const { requester_id, full_name, email, role, sector, access_level, password, phone } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  if (!full_name || !email || !password) return res.status(400).json({ error: 'full_name, email e password são obrigatórios' });

  // Cria o usuário no Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const newUserId = authData.user.id;

  // Cria o perfil
  const { data: profile, error: profErr } = await supabase.from('profiles').upsert({
    id: newUserId,
    full_name: full_name.trim(),
    email,
    company: me.company,
    role: role || '',
    sector: sector || '',
    access_level: access_level || 'lider',
    phone: phone || null,
    active: true,
    first_access: true,
    created_by: requester_id,
  }, { onConflict: 'id' }).select().single();

  if (profErr) return res.status(500).json({ error: profErr.message });
  res.json(profile);
});

// PUT /api/admin/users/:id — atualiza perfil
router.put('/users/:id', async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { full_name, role, sector, access_level, active, permissions, phone } = req.body;

  const updates = {};
  if (full_name    !== undefined) updates.full_name    = full_name;
  if (role         !== undefined) updates.role         = role;
  if (sector       !== undefined) updates.sector       = sector;
  if (access_level !== undefined) updates.access_level = access_level;
  if (active       !== undefined) updates.active       = active;
  if ('permissions' in req.body)  updates.permissions  = permissions;
  if (phone        !== undefined) updates.phone        = phone; // aceita null explícito

  const { data, error } = await supabase.from('profiles').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/admin/users/:id — desativa usuário
router.delete('/users/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('profiles').update({ active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/admin/roles?company=
router.get('/roles', async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });
  const { data, error } = await supabase.from('company_roles').select('*').eq('company', company).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/roles — adiciona cargo customizado
router.post('/roles', async (req, res) => {
  const { requester_id, role_name } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  if (!role_name) return res.status(400).json({ error: 'role_name obrigatório' });

  const { data, error } = await supabase.from('company_roles')
    .upsert({ company: me.company, role_name: role_name.trim() }, { onConflict: 'company,role_name' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/admin/roles/:id
router.delete('/roles/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('company_roles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── SETORES ──────────────────────────────────────────────────────

// GET /api/admin/sectors?company=
router.get('/sectors', async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });
  const { data, error } = await supabase.from('company_sectors').select('*').eq('company', company).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/sectors
router.post('/sectors', async (req, res) => {
  const { requester_id, sector_name } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level, company').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  if (!sector_name) return res.status(400).json({ error: 'sector_name obrigatório' });

  const { data, error } = await supabase.from('company_sectors')
    .upsert({ company: me.company, sector_name: sector_name.trim() }, { onConflict: 'company,sector_name' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/admin/sectors/:id
router.delete('/sectors/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data: me } = await supabase.from('profiles').select('access_level').eq('id', requester_id).single();
  if (!me || me.access_level !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const { error } = await supabase.from('company_sectors').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
