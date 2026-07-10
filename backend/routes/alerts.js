const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Envia alertas de escala para líderes que não fecharam no mês corrente
// Chamado pelo cron job ou manualmente via POST /api/alerts/schedule-reminder
router.post('/schedule-reminder', async (req, res) => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const day   = now.getDate();

  // Só dispara nos dias 24, 25 e 26
  if (![24, 25, 26].includes(day) && req.body.force !== true) {
    return res.json({ skipped: true, reason: `Dia ${day} não é dia de alerta` });
  }

  // Busca todos os perfis (líderes)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, sector, company');

  if (pErr) return res.status(500).json({ error: pErr.message });

  // Busca quem já fechou a escala deste mês
  const { data: submissions } = await supabase
    .from('schedule_submissions')
    .select('user_id')
    .eq('year', year)
    .eq('month', month);

  const submitted = new Set((submissions || []).map(s => s.user_id));

  // Filtra líderes que NÃO fecharam ainda
  const pending = profiles.filter(p => !submitted.has(p.id));

  if (pending.length === 0) {
    return res.json({ sent: 0, message: 'Todos os líderes já fecharam a escala.' });
  }

  const daysLeft = 26 - day;
  const monthName = MONTHS_PT[month - 1];
  const urgency   = day === 26 ? '🚨 HOJE É O PRAZO!' : `⏰ Faltam ${daysLeft} dia${daysLeft!==1?'s':''}!`;

  // Envia e-mail via Supabase Auth (usando o email de cada usuário)
  let sent = 0;
  for (const leader of pending) {
    if (!leader.email) continue;

    const subject = `${urgency} Escala de ${monthName}/${year} precisa ser fechada — Rota 2.0`;
    const body = `
Olá, ${leader.full_name || 'Líder'}!

${urgency}

A escala do mês de ${monthName}/${year} para o setor <b>${leader.sector || ''}</b> ainda não foi fechada no sistema Rota 2.0.

📅 <b>Prazo: dia 26 de cada mês</b>

Acesse o app e finalize a escala da sua equipe:
👉 https://rota2-gestao-lideranca.netlify.app

Após preencher todos os horários, clique no botão <b>"Fechar Escala"</b>.

Esta atividade é registrada como disciplina operacional e consta no relatório de feedbacks da liderança.

—
Rota 2.0 · Sistema de Gestão de Liderança
    `.trim();

    // Usa Supabase Admin para enviar e-mail
    const { error: mailErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: leader.email,
    }).catch(() => ({ error: null }));

    // Como o Supabase não tem envio direto de e-mail customizado via SDK,
    // registramos o alerta na tabela alert_logs para envio via webhook/service worker
    await supabase.from('alert_logs').insert({
      user_id:    leader.id,
      type:       'schedule_reminder',
      channel:    'email',
      year, month, day,
      recipient:  leader.email,
      subject,
      body,
      sent_at:    new Date().toISOString(),
    }).catch(() => {});

    sent++;
  }

  res.json({ sent, pending: pending.length, year, month, day });
});

// GET /api/alerts/status?year=&month= — retorna quem fechou e quem não fechou
router.get('/status', async (req, res) => {
  const { year, month } = req.query;

  const { data: profiles } = await supabase
    .from('profiles').select('id, full_name, email, sector');

  const { data: submissions } = await supabase
    .from('schedule_submissions').select('*')
    .eq('year', year).eq('month', month);

  const submMap = Object.fromEntries((submissions||[]).map(s => [s.user_id, s]));

  const result = (profiles||[]).map(p => ({
    ...p,
    submitted: !!submMap[p.id],
    submitted_at: submMap[p.id]?.submitted_at || null,
    on_time: submMap[p.id]
      ? new Date(submMap[p.id].submitted_at).getDate() <= 26
      : false,
  }));

  res.json(result);
});

module.exports = router;
