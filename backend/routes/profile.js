const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

// Lista perfis por empresa (id, full_name, sector) — para seletores de setor
router.get('/all', async (req, res) => {
  const { company } = req.query;
  // `active`, `role` e `avatar_url` entram para quem monta lista de pessoas
  // na tela: sem `active` daria para convidar alguém já desligado, e sem os
  // outros dois a lista fica só com o nome, difícil de reconhecer.
  // Campos a mais não quebram quem já usa esta rota.
  let query = supabase.from('profiles')
    // reports_to_list: a tela precisa saber quem lidera quem para liberar
    // a edição da escala do time. Já é público no Organograma.
    .select('id, full_name, sector, role, avatar_url, active, access_level, reports_to_list')
    .order('sector');
  if (company) query = query.eq('company', company);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Salva ou atualiza perfil — usa a chave secreta para bypassar RLS
// chamado logo após o signUp, antes do e-mail ser confirmado
router.post('/upsert', async (req, res) => {
  const { id, full_name, email, company, employee_id, sector, role, phone, whatsapp, access_level } = req.body;
  if (!id || !email) return res.status(400).json({ error: 'id e email são obrigatórios' });

  const { data, error } = await supabase.from('profiles').upsert({
    id, full_name, email, company: company || '',
    employee_id: employee_id || '', sector: sector || '',
    role: role || '', phone: phone || '',
    whatsapp: whatsapp || phone || '',
    access_level: access_level || 'lider',
  }, { onConflict: 'id' }).select().single();

  if (error) {
    registrarLog('salvar_perfil', 'profiles', 'erro', { company, user_id: id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('salvar_perfil', 'profiles', 'sucesso', {
    company: data.company, user_id: id,
    depois: { full_name: data.full_name, sector: data.sector, role: data.role, access_level: data.access_level },
  });
  res.json(data);
});

// GET /api/profile/debug-schedule?company=&sector=&year=&month= — diagnóstico temporário
router.get('/debug-schedule', async (req, res) => {
  const { company, sector, year, month } = req.query;

  // Perfis com esse setor nessa empresa
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, sector, access_level, company')
    .eq('company', company)
    .ilike('sector', sector || '%');

  // Entradas de escala em agosto para cada perfil encontrado
  const results = [];
  for (const p of (profiles || [])) {
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = `${year}-${String(month).padStart(2,'0')}-31`;
    const { data: entries, count } = await supabase
      .from('schedule_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', p.id)
      .gte('work_date', from)
      .lte('work_date', to);
    results.push({ ...p, entries_count: count });
  }

  res.json(results);
});

// POST /api/profile/first-access-done — marca first_access como false
router.post('/first-access-done', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { error } = await supabase.from('profiles').update({ first_access: false }).eq('id', user_id);
  if (error) {
    registrarLog('concluir_boas_vindas', 'profiles', 'erro', { user_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('concluir_boas_vindas', 'profiles', 'sucesso', { user_id });
  res.json({ ok: true });
});

module.exports = router;
