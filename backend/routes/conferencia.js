const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const supabase = require('../supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}

// POST /api/conferencia/importar
router.post('/importar', upload.single('file'), async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (!rows.length) return res.status(400).json({ error: 'Planilha vazia' });

    const importado_at = new Date().toISOString();
    const mapped = rows.map(r => ({
      company:                me.company,
      nome_loja:              r['NOME_LOJA']                    || null,
      uf:                     r['UF']                            || null,
      cd_produto:             r['CD_PRODUTO'] != null ? String(r['CD_PRODUTO']).padStart(6, '0') : null,
      ean:                    r['EAN']        != null ? String(r['EAN']) : null,
      descricao_produto:      r['DESCRICAO_PRODUTO']             || null,
      motivo_suspencao:       Math.round(r['MOTIVO_SUSPENCAO']   ?? 0),
      produto_status:         r['PRODUTO_STATUS']                || null,
      descricao_setor:        r['DESCRICAO_SETOR']               || null,
      descricao_departamento: r['DESCRICAO_DEPARTAMENTO']        || null,
      descricao_secao:        r['DESCRICAO_SECAO']               || null,
      descricao_linha:        r['DESCRICAO_LINHA']               || null,
      data_ultima_nf:         r['DATA_ULTIMA_NF'] instanceof Date ? r['DATA_ULTIMA_NF'].toISOString() : null,
      estoque_qty:            Math.round(r['sum_ESTOQUE_ON_HAND_LOJA_QTD'] ?? 0),
      importado_at,
    }));

    // Apaga registros anteriores
    await supabase.from('produtos_conferencia').delete().eq('company', me.company);

    // Insere em batches de 2000 linhas com até 4 em paralelo
    const BATCH = 2000;
    const batches = [];
    for (let i = 0; i < mapped.length; i += BATCH) batches.push(mapped.slice(i, i + BATCH));

    const PARALLEL = 4;
    for (let i = 0; i < batches.length; i += PARALLEL) {
      const grupo = batches.slice(i, i + PARALLEL);
      const resultados = await Promise.all(grupo.map(chunk => supabase.from('produtos_conferencia').insert(chunk)));
      const falhou = resultados.find(r => r.error);
      if (falhou) return res.status(500).json({ error: falhou.error.message });
    }

    res.json({ ok: true, total: mapped.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/conferencia/filtros?requester_id=&setor=&departamento=&secao=
// Retorna valores únicos para os seletores em cascata
router.get('/filtros', async (req, res) => {
  const { requester_id, setor, departamento, secao } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  let q = supabase.from('produtos_conferencia').select('descricao_setor, descricao_departamento, descricao_secao, descricao_linha').eq('company', me.company);
  if (setor)        q = q.eq('descricao_setor', setor);
  if (departamento) q = q.eq('descricao_departamento', departamento);
  if (secao)        q = q.eq('descricao_secao', secao);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const unique = (key) => [...new Set(data.map(r => r[key]).filter(Boolean))].sort();
  res.json({
    setores:        unique('descricao_setor'),
    departamentos:  unique('descricao_departamento'),
    secoes:         unique('descricao_secao'),
    linhas:         unique('descricao_linha'),
  });
});

// GET /api/conferencia/buscar?requester_id=&q=&setor=&departamento=&secao=&linha=
// Busca produto por CD (6 dígitos) ou EAN
router.get('/buscar', async (req, res) => {
  const { requester_id, q } = req.query;
  if (!requester_id || !q) return res.status(400).json({ error: 'requester_id e q obrigatórios' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const termo = String(q).trim();
  let query = supabase.from('produtos_conferencia')
    .select('cd_produto, ean, descricao_produto, produto_status, motivo_suspencao, descricao_setor, descricao_departamento, descricao_secao, descricao_linha, data_ultima_nf, estoque_qty')
    .eq('company', me.company);

  // CD_PRODUTO tem exatamente 6 dígitos, EAN tem mais
  if (/^\d{6}$/.test(termo)) {
    query = query.eq('cd_produto', termo);
  } else {
    query = query.eq('ean', termo);
  }

  const { data, error } = await query.limit(1).single();
  if (error || !data) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(data);
});

// GET /api/conferencia/linha?requester_id=&setor=&departamento=&secao=&linha=
// Lista todos os produtos de uma linha (para gerar relatório de não expostos)
router.get('/linha', async (req, res) => {
  const { requester_id, setor, departamento, secao, linha } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  let q = supabase.from('produtos_conferencia')
    .select('cd_produto, ean, descricao_produto, produto_status, motivo_suspencao, data_ultima_nf, estoque_qty')
    .eq('company', me.company);

  if (setor)        q = q.eq('descricao_setor', setor);
  if (departamento) q = q.eq('descricao_departamento', departamento);
  if (secao)        q = q.eq('descricao_secao', secao);
  if (linha)        q = q.eq('descricao_linha', linha);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/conferencia/sessoes — cria uma nova conferência
router.post('/sessoes', async (req, res) => {
  const { requester_id, setor, departamento, secao, linha } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase.from('conferencias_secao').insert({
    company:      me.company,
    created_by:   requester_id,
    setor, departamento, secao, linha,
    status:       'em_andamento',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/conferencia/sessoes?requester_id=
router.get('/sessoes', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase.from('conferencias_secao')
    .select('*, creator:created_by(full_name)')
    .eq('company', me.company)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// DELETE /api/conferencia/sessoes/:id
router.delete('/sessoes/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: sess } = await supabase.from('conferencias_secao').select('created_by').eq('id', req.params.id).single();
  if (!sess) return res.status(404).json({ error: 'Não encontrado' });
  const isOwner = sess.created_by === requester_id;
  if (!isOwner && !['admin', 'master'].includes(me.access_level)) return res.status(403).json({ error: 'Acesso negado' });

  await supabase.from('conferencias_secao').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

// GET /api/conferencia/sessoes/:id/itens
router.get('/sessoes/:id/itens', async (req, res) => {
  const { data, error } = await supabase.from('conferencia_itens')
    .select('*')
    .eq('conferencia_id', req.params.id)
    .order('coletado_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/conferencia/sessoes/:id/itens — registra item coletado
router.post('/sessoes/:id/itens', async (req, res) => {
  const { cd_produto, ean, descricao_produto } = req.body;
  const { data, error } = await supabase.from('conferencia_itens').insert({
    conferencia_id: req.params.id,
    cd_produto, ean, descricao_produto,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/conferencia/sessoes/:id/itens/:iid — remove item coletado
router.delete('/sessoes/:id/itens/:iid', async (req, res) => {
  const { error } = await supabase.from('conferencia_itens').delete().eq('id', req.params.iid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PUT /api/conferencia/sessoes/:id/finalizar
router.put('/sessoes/:id/finalizar', async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const { data, error } = await supabase.from('conferencias_secao')
    .update({ status: 'finalizada', finalizada_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
