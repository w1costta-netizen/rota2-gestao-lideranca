const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { sendPushToTargets } = require('../lib/push');

// GET /api/agenda?week_start=&user_id=&sector=&company=
// Se user_id + sector fornecidos → filtra itens para aquele usuário
router.get('/', async (req, res) => {
  const { week_start, user_id, sector, company } = req.query;
  let query = supabase.from('agenda_items').select('*').order('day_of_week').order('time');
  if (week_start) {
    // Busca por intervalo da semana (segunda a domingo) para tolerar
    // itens salvos com week_start ligeiramente diferente por bug de fuso horário
    const [wy, wm, wd] = week_start.split('-').map(Number);
    const endDate = new Date(Date.UTC(wy, wm - 1, wd + 7));
    const week_end = endDate.toISOString().split('T')[0];
    query = query.gte('week_start', week_start).lt('week_start', week_end);
  }
  if (company) query = query.eq('company', company);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  if (user_id && data) {
    const filtered = data.filter(item => {
      if (item.target_type === 'geral') return true;
      if (item.target_type === 'setor') return item.target_value === sector;
      if (item.target_type === 'lider') return item.target_value.split(',').includes(user_id);
      return false;
    });
    return res.json(filtered);
  }
  res.json(data);
});

router.get('/leader/:id', async (req, res) => {
  const { week_start } = req.query;
  const { data: leader, error: le } = await supabase.from('leaders').select('*').eq('id', req.params.id).single();
  if (le) return res.status(404).json({ error: 'Líder não encontrado' });

  const { data: items, error: ie } = await supabase.from('agenda_items')
    .select('*').eq('week_start', week_start).order('day_of_week').order('time');
  if (ie) return res.status(500).json({ error: ie.message });

  const filtered = items.filter(item => {
    if (!leader.work_days.includes(item.day_of_week)) return false;
    if (item.target_type === 'geral') return true;
    if (item.target_type === 'setor') return item.target_value === leader.sector;
    if (item.target_type === 'lider') return item.target_value.split(',').includes(String(leader.id));
    return false;
  });
  res.json({ leader, items: filtered });
});

// POST /api/agenda — cria item e dispara push
router.post('/', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time, created_by, lembrete_minutos } = req.body;
  if (!title || !week_start || !target_type || !day_of_week)
    return res.status(400).json({ error: 'Campos obrigatórios: title, week_start, target_type, day_of_week' });

  // Determina company: usa a passada no body, ou busca do criador
  let company = req.body.company || null;
  if (!company && created_by) {
    const { data: me } = await supabase.from('profiles').select('company').eq('id', created_by).single();
    company = me?.company || null;
  }

  const { data, error } = await supabase.from('agenda_items')
    .insert({ title, description: description || '', week_start, target_type, target_value: target_value || '', day_of_week, time: time || '', company, lembrete_minutos: lembrete_minutos ?? null, lembrete_enviado: false })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Dispara push em background (não bloqueia a resposta)
  const dayLabel = { segunda:'Segunda',terca:'Terça',quarta:'Quarta',quinta:'Quinta',sexta:'Sexta',sabado:'Sábado',domingo:'Domingo' };
  const pushPayload = {
    title: '📅 Agenda atualizada',
    body: `${title}${time ? ' às ' + time : ''} — ${dayLabel[day_of_week] || day_of_week}`,
    page: 'agenda',
  };
  if (company) sendPushToTargets({ targetType: target_type, targetValue: target_value, company, payload: pushPayload }).catch(() => {});

  res.status(201).json(data);
});

// PUT /api/agenda/:id — atualiza item e dispara push
router.put('/:id', async (req, res) => {
  const { title, description, week_start, target_type, target_value, day_of_week, time, updated_by, lembrete_minutos } = req.body;
  const { data, error } = await supabase.from('agenda_items')
    .update({ title, description: description || '', week_start, target_type, target_value: target_value || '', day_of_week, time: time || '', lembrete_minutos: lembrete_minutos ?? null, lembrete_enviado: false })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  let company = null;
  if (updated_by) {
    const { data: me } = await supabase.from('profiles').select('company').eq('id', updated_by).single();
    company = me?.company;
  }

  const dayLabel = { segunda:'Segunda',terca:'Terça',quarta:'Quarta',quinta:'Quinta',sexta:'Sexta',sabado:'Sábado',domingo:'Domingo' };
  const pushPayload = {
    title: '📅 Agenda alterada',
    body: `${title}${time ? ' às ' + time : ''} — ${dayLabel[day_of_week] || day_of_week}`,
    page: 'agenda',
  };
  if (company) sendPushToTargets({ targetType: target_type, targetValue: target_value, company, payload: pushPayload }).catch(() => {});

  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('agenda_items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
