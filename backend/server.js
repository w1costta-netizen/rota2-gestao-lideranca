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
app.use('/api/push',     require('./routes/push'));

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`GestãoLiderança backend rodando na porta ${PORT}`));
