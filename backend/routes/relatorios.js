const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError, registrarLog } = require('../lib/auditLog');
const { assinar } = require('../lib/arquivos');
const { enviarPush } = require('../lib/notificacoes');
// Para quem é o tour, quem vê e quem resolve: a regra mora toda aqui.
const T = require('../lib/tourAcesso');

// Campos que guardam CAMINHO de arquivo. Saem daqui como link temporário,
// nunca como endereço fixo — ver backend/lib/arquivos.js.
const ARQUIVOS = ['pdf_url', 'photo_url', 'evidencia_url'];

async function getProfile(id) {
  const { data } = await supabase.from('profiles').select('access_level, company, full_name').eq('id', id).single();
  return data;
}

// Quem pede: a identidade vem conferida pelo token (lib/sessao.js).
const quemPede = (req) => req.usuario?.id || req.query.requester_id || req.body?.requester_id;

async function contexto(req, res) {
  const meId = quemPede(req);
  if (!meId) { res.status(401).json({ error: 'requester_id obrigatório' }); return null; }
  const me = await getProfile(meId);
  if (!me) { res.status(403).json({ error: 'Usuário não encontrado' }); return null; }
  return T.contextoDe(me, meId);
}

// O tour com as fotos, da empresa de quem pede.
async function buscarTour(id, company) {
  const { data } = await supabase
    .from('relatorios_fotograficos')
    .select('*, creator:created_by(full_name), fotos:relatorio_fotos(*)')
    .eq('id', id).eq('company', company)
    .order('order_index', { referencedTable: 'relatorio_fotos', ascending: true })
    .maybeSingle();
  return data;
}

// Avisa quem recebeu. Nunca derruba a ação principal.
function avisar(ids, tour, company, rota) {
  if (!ids.length) return;
  enviarPush(ids, '📷 Você recebeu um Tour 4x4', `${tour.title} — veja os pontos para resolver.`, 'tour', { company, rota })
    .catch(() => {});
}

const LISTA = '*, creator:created_by(full_name), fotos:relatorio_fotos(id, photo_url, order_index, evidencia_url, evidencia_comentario)';

// GET /api/relatorios?requester_id=
router.get('/', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { data, error } = await supabase
    .from('relatorios_fotograficos').select(LISTA)
    .eq('company', ctx.me.company)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const meus = (data || []).filter(t => T.podeVer(t, ctx)).map(t => T.vestir(t, ctx));
  res.json(await assinar(meus, ARQUIVOS));
});

// GET /api/relatorios/pendencias?requester_id= — o cartão do painel.
// Só o que é MEU cuidar: o que chegou para mim e o que eu mandei. O da
// equipe não entra (decisão do usuário: cada um vê no painel o que cuida).
router.get('/pendencias', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { data } = await supabase
    .from('relatorios_fotograficos')
    .select('id, created_by, status, para_tipo, destinatarios, created_at, fotos:relatorio_fotos(evidencia_url, evidencia_comentario)')
    .eq('company', ctx.me.company).not('para_tipo', 'is', null).eq('status', 'finalizado')
    .order('created_at', { ascending: true });
  const lista = data || [];
  const paraMim = lista.filter(t => T.paraMim(t, ctx));
  res.json({
    para_mim: paraMim.length,
    // O mais antigo primeiro: é o que está esperando há mais tempo.
    primeiro: paraMim[0]?.id || null,
    enviados: lista.filter(t => T.enviadoEmAberto(t, ctx)).length,
  });
});

// GET /api/relatorios/pessoas?requester_id=
// enderecaveis: para quem eu posso mandar um tour.
// equipe: por quem eu posso filtrar a lista (admin: toda a liderança;
// os demais: eu e os meus subordinados).
router.get('/pessoas', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const enxuto = p => ({ id: p.id, full_name: p.full_name, sector: p.sector, role: p.role });
  const veTudo = ['admin', 'master'].includes(ctx.me.access_level);
  res.json({
    enderecaveis: ctx.lideranca.filter(p => T.podeEnderecarPara(p.id, ctx)).map(enxuto),
    equipe: veTudo
      ? ctx.lideranca.map(enxuto)
      : [...ctx.porId.values()].filter(p => p.id === ctx.meId || ctx.subordinados.has(p.id)).map(enxuto),
  });
});

// GET /api/relatorios/:id?requester_id=
router.get('/:id', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  // A loja ENTRA na busca: sem isto bastava trocar o id na chamada para
  // ler o relatório — e as fotos — de outra empresa.
  const tour = await buscarTour(req.params.id, ctx.me.company);
  if (!tour || !T.podeVer(tour, ctx)) return res.status(404).json({ error: 'Relatório não encontrado' });
  res.json(await assinar(T.vestir(tour, ctx), ARQUIVOS));
});

// POST /api/relatorios  { requester_id, title, description, para_tipo, destinatarios }
router.post('/', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { title, description, para_tipo, destinatarios } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });
  if (!T.TIPOS.includes(para_tipo)) return res.status(400).json({ error: 'Escolha para quem é o tour.' });
  const ids = para_tipo === 'pessoas' ? [...new Set(Array.isArray(destinatarios) ? destinatarios : [])] : [];
  if (para_tipo === 'pessoas') {
    if (!ids.length) return res.status(400).json({ error: 'Escolha ao menos uma pessoa.' });
    if (!ids.every(id => T.podeEnderecarPara(id, ctx)))
      return res.status(403).json({ error: 'Você só pode mandar o tour para quem é do seu time ou está acima de você.' });
  }

  const { data, error } = await supabase.from('relatorios_fotograficos').insert({
    company: ctx.me.company,
    created_by: ctx.meId,
    title: title.trim(),
    description: description?.trim() || '',
    status: 'rascunho',
    para_tipo,
    destinatarios: ids,
  }).select('*, creator:created_by(full_name)').single();

  if (error) {
    registrarLog('criar_tour_4x4', 'relatorios_fotograficos', 'erro', { company: ctx.me.company, user_id: ctx.meId, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('criar_tour_4x4', 'relatorios_fotograficos', 'sucesso', { company: ctx.me.company, user_id: ctx.meId, depois: { id: data.id, title: data.title, para_tipo, destinatarios: ids } });
  res.json(T.vestir({ ...data, fotos: [] }, ctx));
});

// PUT /api/relatorios/:id
router.put('/:id', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { title, description, status, pdf_url } = req.body;

  const tour = await buscarTour(req.params.id, ctx.me.company);
  if (!tour) return res.status(404).json({ error: 'Não encontrado' });
  if (!T.podeEditar(tour, ctx)) return res.status(403).json({ error: 'Só quem criou o tour pode alterá-lo.' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined)       updates.title       = title.trim();
  if (description !== undefined) updates.description = description?.trim() || '';
  if (status !== undefined)      updates.status      = status;
  if (pdf_url !== undefined)     updates.pdf_url     = pdf_url;

  const { data, error } = await supabase.from('relatorios_fotograficos').update(updates).eq('id', req.params.id)
    .select('*, creator:created_by(full_name)').single();
  if (error) {
    registrarLog('editar_tour_4x4', 'relatorios_fotograficos', 'erro', { company: ctx.me.company, user_id: ctx.meId, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_tour_4x4', 'relatorios_fotograficos', 'sucesso', { company: ctx.me.company, user_id: ctx.meId, depois: updates });
  // Finalizou agora: é quando o tour chega a quem foi endereçado.
  if (status === 'finalizado' && tour.status !== 'finalizado') avisar(T.quemAvisar(data, ctx), data, ctx.me.company, req.originalUrl);
  res.json(await assinar(T.vestir({ ...data, fotos: tour.fotos }, ctx), ARQUIVOS));
});

// POST /api/relatorios/:id/pessoas  { ids } — acrescenta quem vai resolver.
// Pode quem está envolvido (o gerente que recebeu, por exemplo), sempre
// dentro do que ele mesmo poderia endereçar.
router.post('/:id/pessoas', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const tour = await buscarTour(req.params.id, ctx.me.company);
  if (!tour || !T.podeVer(tour, ctx)) return res.status(404).json({ error: 'Não encontrado' });
  if (!T.podeAdicionarPessoas(tour, ctx)) return res.status(403).json({ error: 'Você não pode acrescentar pessoas a este tour.' });
  const atuais = tour.destinatarios || [];
  const novos = [...new Set(Array.isArray(req.body.ids) ? req.body.ids : [])]
    .filter(id => !atuais.includes(id) && id !== tour.created_by);
  if (!novos.length) return res.status(400).json({ error: 'Escolha ao menos uma pessoa nova.' });
  if (!novos.every(id => T.podeEnderecarPara(id, ctx)))
    return res.status(403).json({ error: 'Você só pode acrescentar quem é do seu time ou está acima de você.' });

  const { error } = await supabase.from('relatorios_fotograficos')
    .update({ destinatarios: [...atuais, ...novos] }).eq('id', tour.id);
  if (error) return res.status(500).json({ error: error.message });
  registrarLog('enderecar_tour_4x4', 'relatorios_fotograficos', 'sucesso', { company: ctx.me.company, user_id: ctx.meId, depois: { id: tour.id, acrescentados: novos } });
  if (tour.status === 'finalizado') avisar(novos, tour, ctx.me.company, req.originalUrl);
  res.json(await assinar(T.vestir({ ...tour, destinatarios: [...atuais, ...novos] }, ctx), ARQUIVOS));
});

// DELETE /api/relatorios/:id/pessoas/:pessoaId — só quem criou (ou admin).
router.delete('/:id/pessoas/:pessoaId', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const tour = await buscarTour(req.params.id, ctx.me.company);
  if (!tour) return res.status(404).json({ error: 'Não encontrado' });
  if (!T.podeEditar(tour, ctx)) return res.status(403).json({ error: 'Só quem criou o tour pode tirar pessoas.' });
  const restantes = (tour.destinatarios || []).filter(id => id !== req.params.pessoaId);
  if (!restantes.length) return res.status(400).json({ error: 'O tour precisa de ao menos uma pessoa.' });
  const { error } = await supabase.from('relatorios_fotograficos').update({ destinatarios: restantes }).eq('id', tour.id);
  if (error) return res.status(500).json({ error: error.message });
  registrarLog('enderecar_tour_4x4', 'relatorios_fotograficos', 'sucesso', { company: ctx.me.company, user_id: ctx.meId, depois: { id: tour.id, removido: req.params.pessoaId } });
  res.json(await assinar(T.vestir({ ...tour, destinatarios: restantes }, ctx), ARQUIVOS));
});

// DELETE /api/relatorios/:id
router.delete('/:id', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const tour = await buscarTour(req.params.id, ctx.me.company);
  if (!tour) return res.status(404).json({ error: 'Não encontrado' });
  if (!T.podeEditar(tour, ctx)) return res.status(403).json({ error: 'Só quem criou o tour pode apagá-lo.' });

  const { error } = await supabase.from('relatorios_fotograficos').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_tour_4x4', 'relatorios_fotograficos', 'erro', { company: ctx.me.company, user_id: ctx.meId, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('excluir_tour_4x4', 'relatorios_fotograficos', 'sucesso', { company: ctx.me.company, user_id: ctx.meId, antes: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /api/relatorios/:id/fotos
router.post('/:id/fotos', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { photo_url, caption, order_index, annotations } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url obrigatório' });

  const rel = await buscarTour(req.params.id, ctx.me.company);
  if (!rel) return res.status(404).json({ error: 'Não encontrado' });
  if (!T.podeEditar(rel, ctx)) return res.status(403).json({ error: 'Só quem criou o tour pode pôr fotos.' });

  const { data, error } = await supabase.from('relatorio_fotos').insert({
    relatorio_id: req.params.id,
    photo_url,
    caption: caption || '',
    order_index: order_index ?? 0,
    annotations: annotations || null,
  }).select().single();

  if (error) {
    logError({ company: rel.company, user_id: ctx.meId, acao: 'adicionar_foto_tour', tabela: 'relatorio_fotos', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: rel.company, user_id: ctx.meId, acao: 'adicionar_foto_tour', tabela: 'relatorio_fotos', depois: { relatorio_id: req.params.id, relatorio_titulo: rel.title, photo_url } });
  res.json(await assinar(data, ARQUIVOS));
});

// O ponto e o tour dele, já conferida a empresa de quem pede.
async function fotoDoTour(fotoId, ctx) {
  const { data: foto } = await supabase.from('relatorio_fotos')
    .select('id, photo_url, relatorio_id').eq('id', fotoId).maybeSingle();
  if (!foto) return {};
  const tour = await buscarTour(foto.relatorio_id, ctx.me.company);
  return tour ? { foto, tour } : {};
}

const CAMPOS_DA_CONCLUSAO = ['evidencia_url', 'evidencia_comentario', 'evidencia_at', 'evidencia_by'];

// PUT /api/relatorios/fotos/:fotoId
router.put('/fotos/:fotoId', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { foto, tour } = await fotoDoTour(req.params.fotoId, ctx);
  if (!foto) return res.status(404).json({ error: 'Ponto não encontrado' });

  const { caption, annotations, order_index, photo_url, evidencia_url, evidencia_comentario, evidencia_at } = req.body;
  const updates = {};
  if (caption !== undefined)              updates.caption               = caption;
  // `photo_url` não era aceito aqui: salvar uma foto ANOTADA gravava as
  // formas e descartava a imagem, então ela voltava ao original no
  // recarregamento. A tela mentia porque atualizava o próprio estado.
  if (photo_url !== undefined)            updates.photo_url             = photo_url;
  if (annotations !== undefined)          updates.annotations           = annotations;
  if (order_index !== undefined)          updates.order_index           = order_index;
  if (evidencia_url !== undefined)        updates.evidencia_url         = evidencia_url;
  if (evidencia_comentario !== undefined) updates.evidencia_comentario  = evidencia_comentario;
  if (evidencia_at !== undefined)         updates.evidencia_at          = evidencia_at;
  // Quem concluiu é quem está logado — não o que a tela disser.
  if (evidencia_url !== undefined || evidencia_comentario !== undefined) updates.evidencia_by = ctx.meId;

  const mexeNaConclusao = Object.keys(updates).some(k => CAMPOS_DA_CONCLUSAO.includes(k));
  const mexeNoPonto = Object.keys(updates).some(k => !CAMPOS_DA_CONCLUSAO.includes(k));
  if (mexeNaConclusao && !T.envolvido(tour, ctx))
    return res.status(403).json({ error: 'Só quem criou o tour e quem o recebeu registram a conclusão.' });
  if (mexeNoPonto && !T.podeEditar(tour, ctx))
    return res.status(403).json({ error: 'Só quem criou o tour pode alterar a foto e a descrição.' });

  const { data, error } = await supabase.from('relatorio_fotos').update(updates).eq('id', req.params.fotoId).select().single();
  if (error) {
    registrarLog('editar_foto_tour_4x4', 'relatorio_fotos', 'erro', { user_id: ctx.meId, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: error.message });
  }
  registrarLog('editar_foto_tour_4x4', 'relatorio_fotos', 'sucesso', {
    user_id: ctx.meId,
    depois: { foto_id: req.params.fotoId, campos: Object.keys(updates) },
  });
  res.json(await assinar(data, ARQUIVOS));
});

// DELETE /api/relatorios/fotos/:fotoId
router.delete('/fotos/:fotoId', async (req, res) => {
  const ctx = await contexto(req, res); if (!ctx) return;
  const { foto, tour } = await fotoDoTour(req.params.fotoId, ctx);
  if (!foto) return res.status(404).json({ error: 'Ponto não encontrado' });
  if (!T.podeEditar(tour, ctx)) return res.status(403).json({ error: 'Só quem criou o tour pode remover fotos.' });

  const { error } = await supabase.from('relatorio_fotos').delete().eq('id', req.params.fotoId);
  if (error) {
    logError({ company: tour.company, user_id: ctx.meId, acao: 'remover_foto_tour', tabela: 'relatorio_fotos', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: tour.company, user_id: ctx.meId, acao: 'remover_foto_tour', tabela: 'relatorio_fotos', antes: { relatorio_titulo: tour.title, photo_url: foto.photo_url } });
  res.json({ ok: true });
});

module.exports = router;
