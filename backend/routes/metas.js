const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Metas com número — da loja ou ligadas a um plano de ação.
//
// A meta escrita no PDCA é texto ("reduzir ruptura de 12% para 5%"). Aqui
// ela vira número acompanhável: até três medidas (quantidade, R$, %), cada
// uma com partida e alvo, e lançamentos por data. O cálculo (progresso,
// tendência, qual gráfico) fica no frontend — é leitura, não regra de
// negócio, e evita duas verdades.
//
// QUEM FAZ O QUÊ: gestor (admin, supervisor, líder, master) cria, edita e
// apaga; qualquer pessoa da loja lança número. Validado por loja em toda
// rota — meta é da company de quem pede, sem exceção.
// ─────────────────────────────────────────────────────────────

const MEDIDAS = ['quantidade', 'reais', 'percentual'];
const DIRECOES = ['aumentar', 'reduzir'];
const FREQUENCIAS = ['diario', 'semanal', 'mensal'];
const GRAFICOS = ['auto', 'linha', 'barras', 'progresso'];
const ehData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase.from('profiles')
    .select('id, company, access_level, active').eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}
const ehGestor = p => ['admin', 'supervisor', 'lider', 'master'].includes(p.access_level);
const lojaDe = (me, q) => (me.access_level === 'master' ? (q || me.company) : me.company);

// Partida e alvo de cada medida marcada. Aceita só as três chaves conhecidas.
function validarMedidas(medidas) {
  const limpas = {};
  for (const k of MEDIDAS) {
    const m = medidas?.[k];
    if (!m) continue;
    const inicial = Number(m.inicial), meta = Number(m.meta);
    if (!Number.isFinite(inicial) || !Number.isFinite(meta)) return { erro: `Em "${k}", preencha "hoje está em" e "quer chegar em".` };
    limpas[k] = { inicial, meta };
  }
  if (!Object.keys(limpas).length) return { erro: 'Marque pelo menos uma forma de medir.' };
  return { medidas: limpas };
}

async function metaDaLoja(id, company) {
  const { data } = await supabase.from('metas').select('*').eq('id', id).maybeSingle();
  if (!data || data.company !== company) return null;
  return data;
}

// GET /api/metas?requester_id=&company=
// Devolve as metas com os lançamentos e a lista de planos da loja (para o
// filtro e para o campo "faz parte de um plano?").
router.get('/', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const company = lojaDe(me, req.query.company);
  if (!company) return res.json({ metas: [], planos: [], podeGerir: false });

  const [{ data: metas, error }, { data: planos }] = await Promise.all([
    supabase.from('metas').select('*, criador:criado_por(full_name)')
      .eq('company', company).eq('ativa', true).order('created_at', { ascending: false }),
    supabase.from('planos_acao').select('id, titulo, meta, status')
      .eq('company', company).order('criado_em', { ascending: false }),
  ]);
  if (error) return res.status(500).json({ error: 'Erro ao carregar as metas.' });

  const ids = (metas || []).map(m => m.id);
  const { data: lanc } = ids.length
    ? await supabase.from('metas_lancamentos').select('meta_id, data, valores, lancado_por, created_at, quem:lancado_por(full_name)')
        .in('meta_id', ids).order('data')
    : { data: [] };
  const porMeta = {};
  (lanc || []).forEach(l => (porMeta[l.meta_id] = porMeta[l.meta_id] || []).push(l));

  res.json({
    metas: (metas || []).map(m => ({ ...m, lancamentos: porMeta[m.id] || [] })),
    planos: planos || [],
    podeGerir: ehGestor(me),
  });
});

// POST /api/metas  { requester_id, nome, direcao, prazo, frequencia, medidas, plano_id, company }
router.post('/', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!ehGestor(me)) return res.status(403).json({ error: 'Só quem gerencia a equipe cria metas.' });
  const company = lojaDe(me, req.body?.company);
  if (!company) return res.status(400).json({ error: 'Sem loja definida' });

  const { nome, direcao, prazo, frequencia, medidas, plano_id } = req.body || {};
  if (!nome?.trim()) return res.status(400).json({ error: 'Diga o que você quer acompanhar.' });
  if (!ehData(prazo)) return res.status(400).json({ error: 'Informe até quando.' });
  const v = validarMedidas(medidas);
  if (v.erro) return res.status(400).json({ error: v.erro });

  // O plano, se vier, tem que ser desta loja — senão a meta apareceria
  // dentro do plano de outro cliente.
  let planoFinal = null;
  if (plano_id) {
    const { data: plano } = await supabase.from('planos_acao').select('id, company').eq('id', plano_id).maybeSingle();
    if (!plano || plano.company !== company) return res.status(400).json({ error: 'Plano de ação não encontrado nesta loja.' });
    planoFinal = plano.id;
  }

  const { data, error } = await supabase.from('metas').insert({
    company, plano_id: planoFinal, nome: nome.trim().slice(0, 80),
    direcao: DIRECOES.includes(direcao) ? direcao : 'aumentar',
    prazo, frequencia: FREQUENCIAS.includes(frequencia) ? frequencia : 'mensal',
    medidas: v.medidas, criado_por: me.id,
  }).select('*, criador:criado_por(full_name)').single();
  if (error) {
    registrarLog('criar_meta', 'metas', 'erro', { company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível criar a meta.' });
  }
  registrarLog('criar_meta', 'metas', 'sucesso', { company, user_id: me.id, depois: { id: data.id, nome: data.nome, medidas: Object.keys(v.medidas), plano_id: planoFinal } });
  res.json({ ...data, lancamentos: [] });
});

// PUT /api/metas/:id  — gestor edita; `grafico` qualquer pessoa pode trocar (é preferência de leitura)
router.put('/:id', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const meta = await metaDaLoja(req.params.id, lojaDe(me, req.body?.company));
  if (!meta) return res.status(404).json({ error: 'Meta não encontrada' });

  const { nome, direcao, prazo, frequencia, medidas, plano_id, grafico, ativa } = req.body || {};
  const mudancas = { updated_at: new Date().toISOString() };
  if (grafico !== undefined && GRAFICOS.includes(grafico)) mudancas.grafico = grafico;

  const soGrafico = Object.keys(req.body || {}).every(k => ['requester_id', 'company', 'grafico'].includes(k));
  if (!soGrafico) {
    if (!ehGestor(me)) return res.status(403).json({ error: 'Só quem gerencia a equipe edita metas.' });
    if (nome !== undefined) { if (!nome.trim()) return res.status(400).json({ error: 'A meta precisa de nome.' }); mudancas.nome = nome.trim().slice(0, 80); }
    if (direcao !== undefined && DIRECOES.includes(direcao)) mudancas.direcao = direcao;
    if (prazo !== undefined) { if (!ehData(prazo)) return res.status(400).json({ error: 'Prazo inválido.' }); mudancas.prazo = prazo; }
    if (frequencia !== undefined && FREQUENCIAS.includes(frequencia)) mudancas.frequencia = frequencia;
    if (medidas !== undefined) { const v = validarMedidas(medidas); if (v.erro) return res.status(400).json({ error: v.erro }); mudancas.medidas = v.medidas; }
    if (ativa !== undefined) mudancas.ativa = !!ativa;
    if (plano_id !== undefined) {
      if (plano_id) {
        const { data: plano } = await supabase.from('planos_acao').select('id, company').eq('id', plano_id).maybeSingle();
        if (!plano || plano.company !== meta.company) return res.status(400).json({ error: 'Plano de ação não encontrado nesta loja.' });
      }
      mudancas.plano_id = plano_id || null;
    }
  }

  const { data, error } = await supabase.from('metas').update(mudancas).eq('id', meta.id).select('*, criador:criado_por(full_name)').single();
  if (error) {
    registrarLog('editar_meta', 'metas', 'erro', { company: meta.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível salvar.' });
  }
  if (!soGrafico) registrarLog('editar_meta', 'metas', 'sucesso', { company: meta.company, user_id: me.id, antes: { nome: meta.nome }, depois: mudancas });
  res.json(data);
});

// DELETE /api/metas/:id?requester_id= — some da lista (arquiva), lançamentos ficam
router.delete('/:id', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!ehGestor(me)) return res.status(403).json({ error: 'Só quem gerencia a equipe apaga metas.' });
  const meta = await metaDaLoja(req.params.id, lojaDe(me, req.query.company));
  if (!meta) return res.status(404).json({ error: 'Meta não encontrada' });

  const { error } = await supabase.from('metas').update({ ativa: false, updated_at: new Date().toISOString() }).eq('id', meta.id);
  if (error) return res.status(500).json({ error: 'Não foi possível apagar.' });
  registrarLog('excluir_meta', 'metas', 'sucesso', { company: meta.company, user_id: me.id, antes: { id: meta.id, nome: meta.nome } });
  res.json({ ok: true });
});

// POST /api/metas/:id/lancamentos  { requester_id, data, valores }
// Qualquer pessoa da loja lança. Mesma data → substitui (unique meta_id+data).
router.post('/:id/lancamentos', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const meta = await metaDaLoja(req.params.id, lojaDe(me, req.body?.company));
  if (!meta) return res.status(404).json({ error: 'Meta não encontrada' });
  if (!meta.ativa) return res.status(400).json({ error: 'Esta meta foi apagada.' });

  const { data, valores } = req.body || {};
  if (!ehData(data)) return res.status(400).json({ error: 'Informe a data do lançamento.' });
  // Só as medidas que a meta tem; número válido (zero vale).
  const limpos = {};
  for (const k of Object.keys(meta.medidas || {})) {
    if (valores?.[k] === undefined || valores?.[k] === null || valores?.[k] === '') continue;
    const n = Number(valores[k]);
    if (!Number.isFinite(n)) return res.status(400).json({ error: `Valor inválido em "${k}".` });
    limpos[k] = n;
  }
  if (!Object.keys(limpos).length) return res.status(400).json({ error: 'Informe pelo menos um número.' });

  const { data: salvo, error } = await supabase.from('metas_lancamentos')
    .upsert({ meta_id: meta.id, data, valores: limpos, lancado_por: me.id, created_at: new Date().toISOString() }, { onConflict: 'meta_id,data' })
    .select('meta_id, data, valores, lancado_por, created_at, quem:lancado_por(full_name)').single();
  if (error) {
    registrarLog('lancar_meta', 'metas_lancamentos', 'erro', { company: meta.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível lançar.' });
  }
  registrarLog('lancar_meta', 'metas_lancamentos', 'sucesso', { company: meta.company, user_id: me.id, depois: { meta: meta.nome, data, valores: limpos } });
  res.json(salvo);
});

// DELETE /api/metas/:id/lancamentos/:data?requester_id=
router.delete('/:id/lancamentos/:data', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const meta = await metaDaLoja(req.params.id, lojaDe(me, req.query.company));
  if (!meta) return res.status(404).json({ error: 'Meta não encontrada' });
  if (!ehData(req.params.data)) return res.status(400).json({ error: 'Data inválida' });

  // Quem lançou apaga o próprio; gestor apaga qualquer um.
  const { data: l } = await supabase.from('metas_lancamentos').select('id, lancado_por, valores').eq('meta_id', meta.id).eq('data', req.params.data).maybeSingle();
  if (!l) return res.status(404).json({ error: 'Lançamento não encontrado' });
  if (l.lancado_por !== me.id && !ehGestor(me)) return res.status(403).json({ error: 'Só quem lançou ou um gestor apaga.' });

  const { error } = await supabase.from('metas_lancamentos').delete().eq('id', l.id);
  if (error) return res.status(500).json({ error: 'Não foi possível apagar.' });
  registrarLog('apagar_lancamento_meta', 'metas_lancamentos', 'sucesso', { company: meta.company, user_id: me.id, antes: { meta: meta.nome, data: req.params.data, valores: l.valores } });
  res.json({ ok: true });
});

module.exports = router;
