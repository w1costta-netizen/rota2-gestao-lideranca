require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/leaders',  require('./routes/leaders'));
app.use('/api/agenda',   require('./routes/agenda'));
app.use('/api/pdf',      require('./routes/pdf'));
app.use('/api/profile',  require('./routes/profile'));
app.use('/api/scale',    require('./routes/scale-import'));
app.use('/api/cashier',  require('./routes/cashier-analysis'));
app.use('/api/team',     require('./routes/team'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/alerts',   require('./routes/alerts'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/comunicados',  require('./routes/comunicados'));
app.use('/api/tarefas',      require('./routes/tarefas'));
app.use('/api/mural',        require('./routes/mural'));
app.use('/api/campanhas',    require('./routes/campanhas'));
app.use('/api/relatorios',   require('./routes/relatorios'));
app.use('/api/stores',       require('./routes/stores'));
app.use('/api/organograma',  require('./routes/organograma'));
app.use('/api/reminders',    require('./routes/reminders'));
app.use('/api/estoque',      require('./routes/estoque'));
app.use('/api/reacoes',      require('./routes/reacoes'));
app.use('/api/conferencia',  require('./routes/conferencia'));
app.use('/api/hotmart',      require('./routes/hotmart'));
app.use('/api/pdca',         require('./routes/pdca'));
app.use('/api/logs',         require('./routes/logs'));
app.use('/api/produtividade', require('./routes/produtividade'));
app.use('/api/listas',       require('./routes/listas'));
app.use('/api/atas',         require('./routes/atas'));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Cron job interno: dispara alertas de escala todo dia às 08h ──
// No Render (free tier) o servidor "dorme", então usamos um ping externo
// como o UptimeRobot (gratuito) apontando para /api/alerts/cron a cada dia
app.post('/api/alerts/cron', async (req, res) => {
  // Segurança: só aceita chamada com a secret key correta
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await fetch(`${req.protocol}://${req.get('host')}/api/alerts/schedule-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await result.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Captura de erros não tratados — registra no log de auditoria como falha ──
// Safety net: só pega exceções que escaparam do try/catch de cada rota.
app.use((err, req, res, next) => {
  const { logError } = require('./lib/auditLog');
  logError({
    user_id: req.body?.requester_id || req.query?.requester_id || null,
    company: req.body?.company || req.query?.company || null,
    acao: 'erro_nao_tratado',
    rota: req.originalUrl,
    erro_mensagem: err?.message || String(err),
  });
  console.error('[erro não tratado]', req.originalUrl, err);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`GestãoLiderança backend rodando na porta ${PORT}`));
