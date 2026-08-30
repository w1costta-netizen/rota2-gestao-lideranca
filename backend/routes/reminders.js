const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { enviarPush } = require('../lib/notificacoes');

const DAY_OFFSET = { segunda:0, terca:1, quarta:2, quinta:3, sexta:4, sabado:5, domingo:6 };

// Hora atual no Brasil (UTC-3)
function nowBR() {
  const now = new Date();
  return new Date(now.getTime() - 3 * 60 * 60 * 1000);
}

// POST /api/reminders/check
// Chamado pelo frontend a cada minuto. Dispara push para todos os usuários
// da empresa com alarmes pendentes e retorna os itens do próprio usuário.
router.post('/check', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { data: me } = await supabase.from('profiles').select('company, sector').eq('id', user_id).single();
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const company = me.company;

  const now     = nowBR();
  const todayStr = now.toISOString().split('T')[0];
  const nowMins  = now.getUTCHours() * 60 + now.getUTCMinutes();

  const pending = []; // itens do próprio usuário para tocar som no app

  // ── Tarefas ──────────────────────────────────────────────────────────────
  const { data: tarefas } = await supabase
    .from('tarefas')
    .select('id, title, due_date, due_time, lembrete_minutos, assigned_to')
    .eq('company', company)
    .not('lembrete_minutos', 'is', null)
    .eq('lembrete_enviado', false)
    .neq('status', 'concluida')
    .eq('due_date', todayStr);

  const tarefasFired = [];
  for (const t of tarefas || []) {
    if (!t.due_time) continue;
    const [h, m] = t.due_time.split(':').map(Number);
    const alarmMins = h * 60 + m - (t.lembrete_minutos || 0);
    // Janela de 2 minutos para não perder por atraso de 1 ciclo
    if (nowMins < alarmMins || nowMins >= alarmMins + 2) continue;

    tarefasFired.push(t.id);

    // O lembrete precisa chegar mesmo com o app fechado — é justamente aí
    // que ele serve. Quem está com a tela aberta recebe pelo `pending`
    // abaixo; o push cobre todo o resto do tempo.
    enviarPush(t.assigned_to, '⏰ Lembrete de tarefa', (t.title || '').slice(0, 80), 'tarefa',
      { rota: req.originalUrl });

    if (t.assigned_to === user_id) {
      pending.push({ type: 'tarefa', id: t.id, title: t.title });
    }
  }
  if (tarefasFired.length) {
    await supabase.from('tarefas').update({ lembrete_enviado: true }).in('id', tarefasFired);
  }

  // ── Agenda ───────────────────────────────────────────────────────────────
  const { data: agendaItems } = await supabase
    .from('agenda_items')
    .select('id, title, day_of_week, time, week_start, lembrete_minutos, target_type, target_value')
    .eq('company', company)
    .not('lembrete_minutos', 'is', null)
    .eq('lembrete_enviado', false)
    .not('time', 'is', null);

  // Profiles da empresa para filtrar destinatários
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, sector')
    .eq('company', company)
    .eq('active', true);

  const agendaFired = [];
  for (const a of agendaItems || []) {
    if (!a.week_start) continue;
    const offset = DAY_OFFSET[a.day_of_week] ?? -1;
    if (offset < 0) continue;

    const [wy, wm, wd] = a.week_start.split('-').map(Number);
    const itemDate = new Date(Date.UTC(wy, wm - 1, wd + offset));
    if (itemDate.toISOString().split('T')[0] !== todayStr) continue;

    const [h, m] = a.time.split(':').map(Number);
    const alarmMins = h * 60 + m - (a.lembrete_minutos || 0);
    if (nowMins < alarmMins || nowMins >= alarmMins + 2) continue;

    agendaFired.push(a.id);

    const affectedIds = (profiles || [])
      .filter(p => {
        if (a.target_type === 'geral') return true;
        if (a.target_type === 'setor') return p.sector === a.target_value;
        if (a.target_type === 'lider') return p.id === a.target_value;
        return false;
      })
      .map(p => p.id);

    enviarPush(affectedIds, '📅 Lembrete de agenda', `${a.title} às ${a.time}`, 'agenda',
      { rota: req.originalUrl });

    if (affectedIds.includes(user_id)) {
      pending.push({ type: 'agenda', id: a.id, title: a.title, time: a.time });
    }
  }
  if (agendaFired.length) {
    await supabase.from('agenda_items').update({ lembrete_enviado: true }).in('id', agendaFired);
  }

  res.json({ pending });
});

module.exports = router;
