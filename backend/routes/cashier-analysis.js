const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAIXA_KEYWORDS = [
  'frente de caixa','caixa','checkout','operador de caixa','operadora de caixa',
  'frente caixa','op caixa','operação de caixa','pdv',
];

function isCaixa(setor, funcao) {
  const s = String(setor || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const f = String(funcao || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  return CAIXA_KEYWORDS.some(k => s.includes(k) || f.includes(k));
}

function parseTime(str) {
  if (!str) return null;
  const m = String(str).trim().match(/(\d{1,2})[:\h](\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function dayOfWeekPT(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][d.getUTCDay()];
}

// ── POST /api/cashier/tickets ─── salvar histórico de tickets ─────────────────
router.post('/tickets', async (req, res) => {
  const { user_id, date, entries } = req.body;
  // entries: [{ hour: 8, tickets: 120 }, ...]
  if (!user_id || !date || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'user_id, date e entries são obrigatórios' });
  }

  const rows = entries.map(e => ({
    user_id,
    date,
    day_of_week: dayOfWeekPT(date),
    hour: e.hour,
    tickets: e.tickets,
  }));

  // upsert por user_id + date + hour
  const { error } = await supabase
    .from('cashier_ticket_history')
    .upsert(rows, { onConflict: 'user_id,date,hour' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, saved: rows.length });
});

// ── GET /api/cashier/tickets?user_id=&limit=90 ─── histórico ─────────────────
router.get('/tickets', async (req, res) => {
  const { user_id, limit = 90 } = req.query;
  const { data, error } = await supabase
    .from('cashier_ticket_history')
    .select('*')
    .eq('user_id', user_id)
    .order('date', { ascending: false })
    .limit(parseInt(limit) * 13);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/cashier/averages?user_id= ─── médias por dia da semana + hora ───
router.get('/averages', async (req, res) => {
  const { user_id } = req.query;
  const { data, error } = await supabase
    .from('cashier_ticket_history')
    .select('day_of_week,hour,tickets')
    .eq('user_id', user_id);
  if (error) return res.status(500).json({ error: error.message });

  // agrupar por day_of_week + hour → média
  const map = {};
  for (const row of data) {
    const key = `${row.day_of_week}|${row.hour}`;
    if (!map[key]) map[key] = { sum: 0, count: 0, day_of_week: row.day_of_week, hour: row.hour };
    map[key].sum += row.tickets;
    map[key].count += 1;
  }
  const averages = Object.values(map).map(v => ({
    day_of_week: v.day_of_week,
    hour: v.hour,
    avg_tickets: Math.round(v.sum / v.count),
    sample_count: v.count,
  }));
  res.json(averages);
});

// ── GET /api/cashier/scale-operators?user_id=&day_of_week=quinta ──────────────
// Lê as entradas de escala do usuário, filtra por setor caixa, agrupa por hora
router.get('/scale-operators', async (req, res) => {
  const { user_id, day_of_week } = req.query;

  // busca imports do usuário
  const { data: imports } = await supabase
    .from('scale_imports')
    .select('id')
    .eq('user_id', user_id);

  if (!imports?.length) return res.json([]);

  const importIds = imports.map(i => i.id);

  let query = supabase
    .from('scale_entries')
    .select('nome,setor,funcao,inicio,fim,dia_semana,data')
    .in('import_id', importIds);

  if (day_of_week) query = query.eq('dia_semana', day_of_week);

  const { data: entries, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // filtrar apenas caixa
  const caixaEntries = (entries || []).filter(e => isCaixa(e.setor, e.funcao));

  // Para cada hora do dia (8–21), contar quantos operadores estão ativos
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
  const result = hours.map(h => {
    const hMin = h * 60;
    const count = caixaEntries.filter(e => {
      const s = parseTime(e.inicio);
      const f = parseTime(e.fim);
      if (s === null || f === null) return false;
      return s <= hMin && f > hMin;
    });
    return {
      hour: h,
      operators: count.length,
      names: [...new Set(count.map(e => e.nome))],
    };
  });

  res.json(result);
});

// ── GET /api/cashier/analysis?user_id=&day_of_week=quinta&throughput=25 ───────
// Análise completa: cruza médias históricas + operadores de escala
router.get('/analysis', async (req, res) => {
  const { user_id, day_of_week, throughput = 25 } = req.query;
  const tp = parseInt(throughput);

  // buscar médias
  const { data: avgData, error: e1 } = await supabase
    .from('cashier_ticket_history')
    .select('hour,tickets')
    .eq('user_id', user_id)
    .eq('day_of_week', day_of_week);
  if (e1) return res.status(500).json({ error: e1.message });

  // calcular médias por hora
  const avgMap = {};
  for (const row of avgData || []) {
    if (!avgMap[row.hour]) avgMap[row.hour] = { sum: 0, count: 0 };
    avgMap[row.hour].sum += row.tickets;
    avgMap[row.hour].count += 1;
  }

  // buscar operadores da escala
  const { data: imports } = await supabase.from('scale_imports').select('id').eq('user_id', user_id);
  const importIds = (imports || []).map(i => i.id);

  let scaleEntries = [];
  if (importIds.length) {
    const { data: entries } = await supabase
      .from('scale_entries')
      .select('nome,setor,funcao,inicio,fim,dia_semana')
      .in('import_id', importIds)
      .eq('dia_semana', day_of_week);
    scaleEntries = (entries || []).filter(e => isCaixa(e.setor, e.funcao));
  }

  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const result = hours.map(h => {
    const hMin = h * 60;
    const avgTickets = avgMap[h]
      ? Math.round(avgMap[h].sum / avgMap[h].count)
      : null;
    const sampleCount = avgMap[h]?.count || 0;
    const needed = avgTickets !== null ? Math.ceil(avgTickets / tp) : null;

    const availableOps = scaleEntries.filter(e => {
      const s = parseTime(e.inicio);
      const f = parseTime(e.fim);
      if (s === null || f === null) return false;
      return s <= hMin && f > hMin;
    });
    const available = availableOps.length;

    let status = 'sem_dados';
    if (needed !== null && available > 0) {
      const diff = available - needed;
      if (diff < 0) status = 'critico';
      else if (diff === 0 || diff === 1) status = 'atencao';
      else status = 'ok';
    } else if (needed !== null && available === 0) {
      status = 'sem_escala';
    }

    return {
      hour: h,
      avg_tickets: avgTickets,
      sample_count: sampleCount,
      cashiers_needed: needed,
      cashiers_available: available,
      cashiers_surplus: needed !== null ? available - needed : null,
      status,
      operators: [...new Set(availableOps.map(e => e.nome))],
    };
  });

  res.json({ day_of_week, throughput: tp, hours: result });
});

// ── DELETE /api/cashier/tickets?user_id=&date= ───────────────────────────────
router.delete('/tickets', async (req, res) => {
  const { user_id, date } = req.query;
  const { error } = await supabase
    .from('cashier_ticket_history')
    .delete()
    .eq('user_id', user_id)
    .eq('date', date);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
