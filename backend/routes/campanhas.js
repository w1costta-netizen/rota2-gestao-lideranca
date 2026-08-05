const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../supabase');

const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}
const isManager = p => p && ['admin','supervisor','master'].includes(p.access_level);

// ── CAMPANHAS ─────────────────────────────────────────────────────

// GET /api/campanhas?requester_id=&company=
router.get('/', async (req, res) => {
  const { requester_id, company: queryCompany } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const targetCompany = me.access_level === 'master' ? queryCompany : me.company;

  const { data, error } = await supabase
    .from('campanhas')
    .select(`*, creator:created_by(full_name),
      campanha_itens(id),
      campanha_evidencias(id, item_id)`)
    .eq('company', targetCompany)
    .neq('status', 'arquivada')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campanhas
router.post('/', async (req, res) => {
  const { requester_id, titulo, tipo, validade_ini, validade_fim, company: bodyCompany } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const company = me.access_level === 'master' ? bodyCompany : me.company;
  if (!company) return res.status(400).json({ error: 'company obrigatório para master' });

  const { data, error } = await supabase.from('campanhas').insert({
    company, titulo, tipo: tipo || 'fds',
    validade_ini, validade_fim, created_by: requester_id,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/campanhas/:id
router.put('/:id', async (req, res) => {
  const { requester_id, status, titulo, validade_ini, validade_fim, flyer_pdf_url } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const updates = {};
  if (titulo)                        updates.titulo        = titulo;
  if (status)                        updates.status        = status;
  if (validade_ini)                  updates.validade_ini  = validade_ini;
  if (validade_fim)                  updates.validade_fim  = validade_fim;
  if (flyer_pdf_url !== undefined)   updates.flyer_pdf_url = flyer_pdf_url;

  const { data, error } = await supabase.from('campanhas').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/:id
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  await supabase.from('campanhas').update({ status: 'arquivada' }).eq('id', req.params.id);
  res.json({ ok: true });
});

// ── ITENS ─────────────────────────────────────────────────────────

// GET /api/campanhas/:id/itens
router.get('/:id/itens', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase
    .from('campanha_itens')
    .select(`*, campanha_evidencias(id, foto_url, validado, obs, created_at, user:user_id(full_name))`)
    .eq('campanha_id', req.params.id)
    .order('ordem');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campanhas/:id/itens
router.post('/:id/itens', async (req, res) => {
  const { requester_id, itens } = req.body; // itens = [{descricao, preco, categoria, ordem}]
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const rows = itens.map((item, i) => ({
    campanha_id: req.params.id,
    descricao: item.descricao,
    preco: item.preco || '',
    categoria: item.categoria || '',
    dinamica_comercial: item.dinamica_comercial || null,
    ordem: item.ordem ?? i,
  }));

  const { data, error } = await supabase.from('campanha_itens').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campanhas/:id/extrair-itens — extrai itens do flyer via IA
router.post('/:id/extrair-itens', upload.array('arquivos', 10), async (req, res) => {
  const { requester_id } = req.body;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  if (!req.files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });

  try {
    // Monta conteúdo com todos os arquivos
    const content = [];
    content.push({
      type: 'text',
      text: `Você é um especialista em leitura de encartes e flyers promocionais de supermercado/clube de compras.
Analise o(s) flyer(s) enviados e extraia TODOS os itens promocionais, sem pular nenhum, mesmo os pequenos ou nos cantos da página.

Instruções:
- Extraia a descrição COMPLETA igual ao impresso: produto + marca + variante + peso/volume. Não abrevia.
- Diferencie preço "De" (riscado/tachado) do preço "Por" (final em destaque). Se houver só um preço, coloque em preco_por e deixe preco_de vazio.
- Capture a dinâmica comercial COMPLETA: "leve X pague Y", "% desconto na 2ª unidade", "limitado a N por sócio", "nos cartões X", "unidade sai por R$", etc. É informação tão importante quanto o preço.
- Marque confianca: "baixa" quando o texto ou número estiver borrado, cortado ou ambíguo — não arrisque um valor errado.
- Agrupe por categoria/seção do flyer quando identificável pelos títulos ou cores de fundo.
- Se houver múltiplas páginas, leia todas e extraia todos os itens.`,
    });

    for (const file of req.files) {
      const isPdf = file.mimetype === 'application/pdf';
      if (isPdf) {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') },
        });
      } else {
        const imgType = file.mimetype.startsWith('image/') ? file.mimetype : 'image/jpeg';
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: imgType, data: file.buffer.toString('base64') },
        });
      }
    }

    const hasPdf = req.files.some(f => f.mimetype === 'application/pdf');
    const createParams = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      tools: [{
        name: 'registrar_itens_flyer',
        description: 'Registra os itens extraídos do encarte promocional',
        input_schema: {
          type: 'object',
          properties: {
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  descricao:          { type: 'string', description: 'Nome do produto, marca, variante e peso/volume, igual ao impresso' },
                  preco_de:           { type: 'string', description: 'Preço De (riscado), se houver, formato 0,00' },
                  preco_por:          { type: 'string', description: 'Preço final Por ou preço único, formato 0,00' },
                  dinamica_comercial: { type: 'string', description: 'Texto completo da promoção: desconto, leve-pague, limite, condição de cartão etc.' },
                  categoria:          { type: 'string', description: 'Categoria/seção do flyer' },
                  confianca:          { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Confiança na leitura' },
                },
                required: ['descricao', 'preco_por', 'confianca'],
              },
            },
          },
          required: ['itens'],
        },
      }],
      tool_choice: { type: 'tool', name: 'registrar_itens_flyer' },
      messages: [{ role: 'user', content }],
    };
    if (hasPdf) createParams.betas = ['pdfs-2024-09-25'];
    console.log('[IA] Enviando para Anthropic — arquivos:', req.files.map(f => `${f.originalname} (${f.mimetype}, ${f.size}b)`));
    const response = hasPdf
      ? await anthropic.beta.messages.create(createParams)
      : await anthropic.messages.create(createParams);

    console.log('[IA] stop_reason:', response.stop_reason, '| blocks:', response.content.map(b => b.type));
    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) {
      const text = response.content.find(b => b.type === 'text');
      console.error('[IA] Sem tool_use. Texto:', text?.text?.slice(0, 300));
      return res.status(500).json({ error: 'IA não retornou itens estruturados. ' + (text?.text || '') });
    }

    console.log('[IA] Itens extraídos:', toolUse.input.itens?.length ?? 0);
    res.json({ itens: toolUse.input.itens || [] });
  } catch (e) {
    console.error('Erro extração IA:', e.status, e.message, e.error);
    res.status(500).json({ error: e.message || 'Erro interno' });
  }
});

// PUT /api/campanhas/itens/:itemId
router.put('/itens/:itemId', async (req, res) => {
  const { requester_id, descricao, preco, categoria } = req.body;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data, error } = await supabase.from('campanha_itens')
    .update({ descricao, preco, categoria })
    .eq('id', req.params.itemId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/itens/:itemId
router.delete('/itens/:itemId', async (req, res) => {
  const { requester_id } = req.query;
  const me = await getProfile(requester_id);
  if (!isManager(me)) return res.status(403).json({ error: 'Acesso negado' });
  await supabase.from('campanha_itens').delete().eq('id', req.params.itemId);
  res.json({ ok: true });
});

// ── EVIDÊNCIAS ────────────────────────────────────────────────────

// POST /api/campanhas/evidencias
router.post('/evidencias', async (req, res) => {
  const { requester_id, item_id, campanha_id, foto_url, obs } = req.body;
  if (!requester_id || !item_id || !foto_url) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  // Remove evidência anterior do mesmo item (substitui)
  await supabase.from('campanha_evidencias').delete().eq('item_id', item_id).eq('user_id', requester_id);

  const { data, error } = await supabase.from('campanha_evidencias').insert({
    item_id, campanha_id, user_id: requester_id, foto_url, obs: obs || '',
  }).select('*, user:user_id(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campanhas/evidencias/:evId
router.delete('/evidencias/:evId', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  await supabase.from('campanha_evidencias').delete().eq('id', req.params.evId);
  res.json({ ok: true });
});

// GET /api/campanhas/:id/relatorio — dados completos para PDF
router.get('/:id/relatorio', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data: campanha } = await supabase.from('campanhas').select('*, creator:created_by(full_name)').eq('id', req.params.id).single();
  const { data: itens } = await supabase.from('campanha_itens')
    .select('*, campanha_evidencias(id, foto_url, obs, created_at, user:user_id(full_name))')
    .eq('campanha_id', req.params.id).order('ordem');

  res.json({ campanha, itens: itens || [] });
});

module.exports = router;
