const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}

function dayOfWeekPT(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][d.getUTCDay()];
}

// GET /api/schedule/month?user_id=&year=&month=
router.get('/month', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(name,matricula,role,sector), editor:last_edited_by(full_name)')
    .eq('user_id', user_id)
    .gte('work_date', from)
    .lte('work_date', to);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/schedule/last-editor?user_id=&year=&month=
router.get('/last-editor', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.json(null);

  const lastDay2 = new Date(parseInt(year), parseInt(month), 0).getDate();
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay2).padStart(2,'0')}`;

  const { data } = await supabase
    .from('schedule_entries')
    .select('last_edited_by, last_edited_at, editor:last_edited_by(full_name)')
    .eq('user_id', user_id)
    .gte('work_date', from)
    .lte('work_date', to)
    .not('last_edited_at', 'is', null)
    .order('last_edited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json(data || null);
});

// POST /api/schedule/save
router.post('/save', async (req, res) => {
  const { user_id, team_member_id, work_date, status, entrada, intervalo, retorno_intervalo, saida } = req.body;
  if (!user_id || !team_member_id || !work_date)
    return res.status(400).json({ error: 'user_id, team_member_id e work_date são obrigatórios' });

  // Busca dados do perfil para preencher company/sector nos entries
  const { data: prof } = await supabase
    .from('profiles')
    .select('company, sector, full_name')
    .eq('id', user_id)
    .maybeSingle();

  const week_start  = getWeekStart(work_date);
  const day_of_week = dayOfWeekPT(work_date);
  const isWork      = (status || 'trabalha') === 'trabalha';

  const { data, error } = await supabase
    .from('schedule_entries')
    .upsert({
      user_id,
      team_member_id,
      work_date,
      week_start,
      day_of_week,
      status:            status || 'trabalha',
      entrada:           isWork ? (entrada || null)           : null,
      intervalo:         isWork ? (intervalo || null)         : null,
      retorno_intervalo: isWork ? (retorno_intervalo || null) : null,
      saida:             isWork ? (saida || null)             : null,
      start_time:        isWork ? (entrada || null)           : null,
      end_time:          isWork ? (saida   || null)           : null,
      company:           prof?.company || null,
      sector:            prof?.sector  || null,
      last_edited_by:    user_id,
      last_edited_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,team_member_id,work_date' })
    .select('*, team_members(name,matricula,role,sector)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/schedule/submission?user_id=&year=&month=
router.get('/submission', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.json(null);

  const { data, error } = await supabase
    .from('schedule_submissions')
    .select('*')
    .eq('user_id', user_id)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month))
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// POST /api/schedule/submit
router.post('/submit', async (req, res) => {
  const { user_id, year, month } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { data, error } = await supabase
    .from('schedule_submissions')
    .upsert(
      { user_id, year: parseInt(year), month: parseInt(month), submitted_at: new Date().toISOString() },
      { onConflict: 'user_id,year,month' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/schedule/submission
router.delete('/submission', async (req, res) => {
  const { user_id, year, month } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { error } = await supabase
    .from('schedule_submissions')
    .delete()
    .eq('user_id', user_id)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month));

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/schedule?user_id=&week_start= (legado)
router.get('/', async (req, res) => {
  const { user_id, week_start } = req.query;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(id,name,matricula,role,sector)')
    .eq('user_id', user_id)
    .eq('week_start', week_start)
    .order('work_date');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/schedule/operators?user_id=&day_of_week=&year=&month=
router.get('/operators', async (req, res) => {
  const { user_id, day_of_week, year, month } = req.query;

  // Busca empresa do usuário
  const { data: prof } = await supabase
    .from('profiles').select('company').eq('id', user_id).maybeSingle();
  if (!prof?.company) return res.json([]);

  // Faixa do mês (padrão: mês atual)
  const y = parseInt(year)  || new Date().getFullYear();
  const m = parseInt(month) || (new Date().getMonth() + 1);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const to   = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { data, error } = await supabase
    .from('schedule_entries')
    .select('team_member_id, entrada, intervalo, retorno_intervalo, saida, status, team_members(name,sector,role)')
    .eq('company', prof.company)
    .eq('day_of_week', day_of_week)
    .eq('status', 'trabalha')
    .gte('work_date', from)
    .lte('work_date', to);
  if (error) return res.status(500).json({ error: error.message });

  const CASHIER_ROLES = ['operador loja', 'aprendiz'];

  // Converte "HH:MM" em minutos, retorna null se inválido
  const toMin = (t) => {
    if (!t) return null;
    const [hh, mm] = t.split(':').map(Number);
    return isNaN(hh) ? null : hh * 60 + (mm || 0);
  };

  // Filtra apenas cargos de caixa com horários preenchidos
  const filtered = (data || []).filter(e => {
    const role = (e.team_members?.role || '').toLowerCase().trim();
    return CASHIER_ROLES.includes(role) && e.entrada && e.saida;
  });

  // Deduplica por team_member_id mantendo a entrada com horário válido
  const seen = new Set();
  const cashierEntries = filtered.filter(e => {
    if (seen.has(e.team_member_id)) return false;
    seen.add(e.team_member_id);
    return true;
  });

  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const result = hours.map(h => {
    const hMin = h * 60;
    const active = cashierEntries.filter(e => {
      const entMin = toMin(e.entrada);
      const saiMin = toMin(e.saida);
      const intMin = toMin(e.intervalo);
      const retMin = toMin(e.retorno_intervalo);

      if (entMin === null || saiMin === null) return false;

      // Operador cobre esta faixa horária?
      if (entMin > hMin || saiMin <= hMin) return false;

      // Operador está no intervalo durante esta faixa?
      if (intMin !== null && retMin !== null && intMin <= hMin && retMin > hMin) return false;

      return true;
    });
    return { hour: h, operators: active.length, names: active.map(e => e.team_members?.name).filter(Boolean) };
  });
  res.json(result);
});

// DELETE /api/schedule/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('schedule_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
