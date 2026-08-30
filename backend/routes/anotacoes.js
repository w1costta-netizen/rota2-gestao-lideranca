const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');

// ─────────────────────────────────────────────────────────────
// Anotações pessoais — modelo Google Keep.
//
// São PESSOAIS: só o dono vê as suas, igual ao módulo Listas. Toda rota
// confere o dono antes de ler ou alterar — sem isso, bastaria trocar o id
// na chamada para ler a anotação de outra pessoa.
// ─────────────────────────────────────────────────────────────

// Cor é guardada por nome, não por código, para o cartão se adaptar ao tema
// claro e escuro. Qualquer valor fora desta lista vira 'padrao'.
const CORES = ['padrao', 'amarelo', 'verde', 'roxo', 'coral', 'azul'];
const corValida = c => (CORES.includes(c) ? c : 'padrao');

async function daPessoa(id, user_id) {
  const { data } = await supabase
    .from('anotacoes').select('id, user_id, titulo').eq('id', id).maybeSingle();
  return data && data.user_id === user_id ? data : null;
}

// GET /api/anotacoes?requester_id=&arquivadas=
router.get('/', async (req, res) => {
  const { requester_id, arquivadas } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const { data, error } = await supabase
    .from('anotacoes')
    .select('*')
    .eq('user_id', requester_id)
    .eq('arquivada', arquivadas === '1')
    // Fixadas primeiro, depois a mexida mais recente — é a ordem que a
    // pessoa espera ver ao abrir.
    .order('fixada', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    registrarLog('listar_anotacoes', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao carregar as anotações.' });
  }
  res.json(data || []);
});

// POST /api/anotacoes  { requester_id, titulo, texto, cor }
router.post('/', async (req, res) => {
  const { requester_id, titulo, texto, cor } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  if (!titulo?.trim() && !texto?.trim()) {
    return res.status(400).json({ error: 'Escreva um título ou um texto.' });
  }

  const { data, error } = await supabase.from('anotacoes').insert({
    user_id: requester_id,
    titulo: (titulo || '').trim(),
    texto:  (texto  || '').trim(),
    cor: corValida(cor),
  }).select().single();

  if (error) {
    registrarLog('criar_anotacao', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar a anotação.' });
  }
  // O conteúdo não vai para o log: a anotação é pessoal, e quem lê os Logs
  // não deveria conseguir ler o que a pessoa escreveu.
  registrarLog('criar_anotacao', 'anotacoes', 'sucesso', { user_id: requester_id, depois: { id: data.id } });
  res.json(data);
});

// PUT /api/anotacoes/:id  { requester_id, titulo, texto, cor, fixada, arquivada }
router.put('/:id', async (req, res) => {
  const { requester_id, titulo, texto, cor, fixada, arquivada } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const minha = await daPessoa(req.params.id, requester_id);
  if (!minha) return res.status(404).json({ error: 'Anotação não encontrada' });

  const mudancas = { updated_at: new Date().toISOString() };
  if (titulo    !== undefined) mudancas.titulo    = (titulo || '').trim();
  if (texto     !== undefined) mudancas.texto     = (texto  || '').trim();
  if (cor       !== undefined) mudancas.cor       = corValida(cor);
  if (fixada    !== undefined) mudancas.fixada    = !!fixada;
  if (arquivada !== undefined) mudancas.arquivada = !!arquivada;

  const { data, error } = await supabase
    .from('anotacoes').update(mudancas).eq('id', req.params.id).select().single();

  if (error) {
    registrarLog('editar_anotacao', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao salvar a anotação.' });
  }
  res.json(data);
});

// DELETE /api/anotacoes/:id?requester_id=
router.delete('/:id', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const minha = await daPessoa(req.params.id, requester_id);
  if (!minha) return res.status(404).json({ error: 'Anotação não encontrada' });

  const { error } = await supabase.from('anotacoes').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_anotacao', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao excluir a anotação.' });
  }
  registrarLog('excluir_anotacao', 'anotacoes', 'sucesso', { user_id: requester_id, antes: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
