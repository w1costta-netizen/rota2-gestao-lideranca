require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/leaders', require('./routes/leaders'));
app.use('/api/agenda', require('./routes/agenda'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/scale', require('./routes/scale-import'));
app.use('/api/cashier', require('./routes/cashier-analysis'));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`GestãoLiderança backend rodando na porta ${PORT}`));
