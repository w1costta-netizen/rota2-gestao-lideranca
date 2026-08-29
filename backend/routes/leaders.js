const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('leaders').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('leaders').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Líder não encontrado' });
  res.json(data);
});

router.post('/', async (req, res) => {
  const { name, sector, whatsapp, work_days, start_time, end_time } = req.body;
  if (!name || !sector || !whatsapp || !work_days || !start_time || !end_time)
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });

  const { data, error } = await supabase.from('leaders')
    .insert({ name, sector, whatsapp, work_days, start_time, end_time })
    .select().single();
  if (error) {
    registrarLog('criar_lider', 'leaders', 'erro', { user_id: req.body.requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_lider', 'leaders', 'sucesso', { user_id: req.body.requester_id, depois: { id: data.id, name: data.name, sector: data.sector } });
  res.status(201).json(data);
});

router.put('/:id', async (req, res) => {
  const { name, sector, whatsapp, work_days, start_time, end_time } = req.body;
  const { data: antes } = await supabase.from('leaders').select('name, sector').eq('id', req.params.id).maybeSingle();
  const { data, error } = await supabase.from('leaders')
    .update({ name, sector, whatsapp, work_days, start_time, end_time })
    .eq('id', req.params.id)
    .select().single();
  if (error) {
    registrarLog('editar_lider', 'leaders', 'erro', { user_id: req.body.requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_lider', 'leaders', 'sucesso', {
    user_id: req.body.requester_id,
    antes: { name: antes?.name, sector: antes?.sector },
    depois: { name: data.name, sector: data.sector },
  });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { data: antes } = await supabase.from('leaders').select('name, sector').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('leaders').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_lider', 'leaders', 'erro', { user_id: req.query.requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_lider', 'leaders', 'sucesso', { user_id: req.query.requester_id, antes: { name: antes?.name, sector: antes?.sector } });
  res.json({ ok: true });
});

router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const text = req.file.buffer.toString('utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const required = ['nome', 'setor', 'whatsapp', 'dias', 'inicio', 'fim'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return res.status(400).json({ error: `Colunas faltando: ${missing.join(', ')}` });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    const work_days = row['dias'].split(';').map(d => d.trim()).filter(Boolean);
    rows.push({ name: row['nome'], sector: row['setor'], whatsapp: row['whatsapp'], work_days, start_time: row['inicio'], end_time: row['fim'] });
  }

  const { error } = await supabase.from('leaders').insert(rows);
  if (error) {
    registrarLog('importar_lideres_csv', 'leaders', 'erro', { user_id: req.body.requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('importar_lideres_csv', 'leaders', 'sucesso', {
    user_id: req.body.requester_id,
    depois: { arquivo: req.file.originalname, importados: rows.length },
  });
  res.json({ imported: rows.length });
});

module.exports = router;
