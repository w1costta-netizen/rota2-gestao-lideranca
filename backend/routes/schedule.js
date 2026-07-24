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

/**
 * Retorna o user_id "canônico" do setor — o primeiro líder cadastrado com
 * aquele setor+empresa. Isso garante que todos que editam o mesmo setor
 * escrevem no mesmo conjunto de linhas (sem duplicatas).
 */
async function getCanonicalUserId(company, sector, fallbackId) {
  if (!company || !sector) return fallbackId;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('company', company)
    .ilike('sector', sector.trim())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id || fallbackId;
}

async function getProfileInfo(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('company, sector, full_name')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

// GET /api/schedule?user_id=&week_start=
router.get('/', async (req, res) => {
  const { user_id, week_start } = req.query;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(id,name,matricula,role,sector)')
    .eq('user_id', user_id)
    .eq('week_start', week_start)
    .order('work_date');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/schedule/month?user_id=&year=&month=&sector=&company=
router.get('/month', async (req, res) => {
  const { user_id, year, month, sector, company } = req.query;
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-31`;

  const canonicalId = await getCanonicalUserId(company, sector, user_id);

  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*, team_members(name,matricula,role,sector), editor:last_edited_by(full_name)')
    .eq('user_id', canonicalId)
    .gte('work_date', from)
    .lte('work_date', to);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/schedule/last-editor?user_id=&sector=&company=&year=&month=
router.get('/last-editor', async (req, res) => {
  const { user_id, sector, company, year, month } = req.query;
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-31`;

  const canonicalId = await getCanonicalUserId(company, sector, user_id);

  const { data } = await supabase
    .from('schedule_entries')
    .select('last_edited_by, last_edited_at, editor:last_edited_by(full_name)')
    .eq('user_id', canonicalId)
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

  // Resolve setor+empresa do editor
  const editorProfile = await getProfileInfo(user_id);
  const company  = editorProfile?.company  || null;
  const sector   = editorProfile?.sector   || null;

  // Canonical owner do setor
  const canonicalId = await getCanonicalUserId(company, sector, user_id);

  const week_start  = getWeekStart(work_date);
  const day_of_week = dayOfWeekPT(work_date);
  const isWork      = status === 'trabalha';

  const { data, error } = await supabase
    .from('schedule_entries')
    .upsert({
      user_id: canonicalId,
      team_member_id, work_date, week_start, day_of_week,
      status: status || 'trabalha',
      entrada:           isWork ? (entrada || null)           : null,
      intervalo:         isWork ? (intervalo || null)         : null,
      retorno_intervalo: isWork ? (retorno_intervalo || null) : null,
      saida:             isWork ? (saida || null)             : null,
      start_time: isWork ? (entrada || null) : null,
      end_time:   isWork ? (saida   || null) : null,
      // campos de colaboração
      company,
      sector,
      last_edited_by:  user_id,
      last_edited_at:  new Date().toISOString(),
    }, { onConflict: 'user_id,team_member_id,work_date' })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/schedule/submission
router.delete('/submission', async (req, res) => {
  const { user_id, year, month, sector, company } = req.query;
  const canonicalId = await getCanonicalUserId(company, sector, user_id);
  const { error } = await supabase
    .from('schedule_submissions')
    .delete()
    .eq('user_id', canonicalId)
    .eq('year', parseInt(year))
    .eq('month', parseInt(month));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /api/schedule/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('schedule_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/schedule/operators?user_id=&day_of_week=
router.get('/operators', async (req, res) => {
  const { user_id, day_of_week } = req.query;
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('entrada, saida, status, team_members(name,sector,role)')
    .eq('user_id', user_id)
    .eq('day_of_week', day_of_week)
    .eq('status', 'trabalha');
  if (error) return res.status(500).json({ error: error.message });

  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const result = hours.map(h => {
    const hMin = h * 60;
    const active = (data || []).filter(e => {
      const [sh, sm] = (e.entrada || '').split(':').map(Number);
      const [eh, em] = (e.saida   || '').split(':').map(Number);
      if (isNaN(sh) || isNaN(eh)) return false;
      return (sh*60+(sm||0)) <= hMin && (eh*60+(em||0)) > hMin;
    });
    return { hour: h, operators: active.length, names: active.map(e => e.team_members?.name).filter(Boolean) };
  });
  res.json(result);
});

// GET /api/schedule/submission?user_id=&year=&month=&sector=&company=
router.get('/submission', async (req, res) => {
  const { user_id, year, month, sector, company } = req.query;
  const canonicalId = await getCanonicalUserId(company, sector, user_id);
  const { data, error } = await supabase
    .from('schedule_submissions')
    .select('*')
    .eq('user_id', canonicalId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/schedule/submit
router.post('/submit', async (req, res) => {
  const { user_id, year, month } = req.body;
  const editorProfile = await getProfileInfo(user_id);
  const canonicalId = await getCanonicalUserId(editorProfile?.company, editorProfile?.sector, user_id);
  const { data, error } = await supabase
    .from('schedule_submissions')
    .upsert({ user_id: canonicalId, year, month, submitted_at: new Date().toISOString() },
      { onConflict: 'user_id,year,month' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
