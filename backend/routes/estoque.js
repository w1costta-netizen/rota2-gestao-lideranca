const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');

// POST /api/estoque/payload — salva payload do importador (sync entre dispositivos)
router.post('/payload', async (req, res) => {
  const { company, payload, requester_id } = req.body;
  if (!company || !payload) return res.status(400).json({ error: 'company e payload obrigatórios' });

  const { error } = await supabase
    .from('estoque_payloads')
    .upsert({ company, payload, updated_at: new Date().toISOString() }, { onConflict: 'company' });

  if (error) {
    logError({ company, user_id: requester_id, acao: 'importar_estoque', tabela: 'estoque_payloads', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({
    company, user_id: requester_id, acao: 'importar_estoque', tabela: 'estoque_payloads',
    depois: { itens: payload?.totais?.itens_total ?? null, gerado_em: payload?.gerado_em ?? null },
  });
  res.json({ ok: true });
});

// GET /api/estoque/payload?company=xxx — retorna último payload salvo
router.get('/payload', async (req, res) => {
  const { company } = req.query;
  if (!company) return res.status(400).json({ error: 'company obrigatório' });

  const { data, error } = await supabase
    .from('estoque_payloads')
    .select('payload, updated_at')
    .eq('company', company)
    .single();

  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
  if (!data) return res.json({ payload: null });
  res.set('Cache-Control', 'no-store');
  res.json({ payload: data.payload, updated_at: data.updated_at });
});

module.exports = router;
