const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const G = require('../lib/googleAgenda');

// ─────────────────────────────────────────────────────────────
// Ligar o Google Agenda à Agenda do Rota. Ver lib/googleAgenda.js.
//
// Enquanto as credenciais do Google não estão no Render, tudo aqui
// responde "não configurado" e a tela esconde o botão — melhor do que um
// botão que leva a um erro.
// ─────────────────────────────────────────────────────────────

const naoConfigurado = (res) =>
  res.status(503).json({ error: 'A ligação com o Google Agenda ainda não foi configurada.' });

// GET /api/google/status?requester_id=
router.get('/status', async (req, res) => {
  const userId = req.usuario?.id;
  if (!G.configurado()) return res.json({ configurado: false });
  const { data } = await supabase.from('google_conexoes')
    .select('email_google, conectado_em, ultima_sincronizacao, ultimo_erro').eq('user_id', userId).maybeSingle();
  res.json({
    configurado: true,
    conectado: !!data,
    email: data?.email_google || null,
    ultima_sincronizacao: data?.ultima_sincronizacao || null,
    precisa_reconectar: data?.ultimo_erro === 'reconectar',
  });
});

// POST /api/google/conectar  { requester_id } → { url }
router.post('/conectar', async (req, res) => {
  if (!G.configurado()) return naoConfigurado(res);
  res.json({ url: G.urlDeAutorizacao(req.usuario.id) });
});

// GET /api/google/callback?code=&state=   (vem do Google, sem sessão)
//
// É um redirecionamento do navegador: não carrega o token do app. Quem
// prova de quem é o pedido é o `state` assinado (lib/googleAgenda.js).
// No fim, sempre devolve a pessoa para o app — erro aqui vira aviso na
// tela, nunca uma página em branco do servidor.
router.get('/callback', async (req, res) => {
  const voltar = (status, motivo) =>
    res.redirect(`${G.APP_URL()}/?google=${status}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`);

  if (!G.configurado()) return voltar('erro', 'nao_configurado');
  if (req.query.error) return voltar('erro', req.query.error === 'access_denied' ? 'recusado' : 'google');

  const userId = G.lerEstado(req.query.state);
  if (!userId || !req.query.code) return voltar('erro', 'expirado');

  try {
    const { refreshToken, escopos, email } = await G.trocarCodigo(String(req.query.code));
    // Na tela de permissão do Google a pessoa pode DESMARCAR a agenda e
    // seguir em frente. Aí não há o que ler — melhor dizer do que ligar
    // uma conexão vazia.
    if (!escopos.includes(G.ESCOPO_AGENDA)) return voltar('erro', 'sem_permissao_agenda');
    if (!refreshToken) return voltar('erro', 'sem_renovacao');

    const { error } = await supabase.from('google_conexoes').upsert({
      user_id: userId,
      email_google: email,
      refresh_token_cifrado: G.cifrar(refreshToken),
      conectado_em: new Date().toISOString(),
      ultimo_erro: null,
    }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);

    registrarLog('conectar_google', 'google_conexoes', 'sucesso', { user_id: userId, depois: { email } });
    // Primeira leitura já aqui: quem volta para o app vê as reuniões na
    // agenda, em vez de uma agenda vazia esperando o próximo ciclo.
    await G.sincronizarUsuario(userId);
    return voltar('conectado');
  } catch (e) {
    registrarLog('conectar_google', 'google_conexoes', 'erro', { user_id: userId, erro: e.message });
    return voltar('erro', 'google');
  }
});

// POST /api/google/sincronizar  { requester_id }
router.post('/sincronizar', async (req, res) => {
  if (!G.configurado()) return naoConfigurado(res);
  const r = await G.sincronizarUsuario(req.usuario.id);
  if (!r.ok && r.motivo === 'reconectar') return res.status(409).json({ error: 'A ligação com o Google expirou. Conecte de novo.', reconectar: true });
  if (!r.ok && r.motivo === 'sem_conexao') return res.status(404).json({ error: 'Google Agenda não conectado.' });
  if (!r.ok) return res.status(502).json({ error: 'Não foi possível buscar as reuniões no Google agora.' });
  res.json(r);
});

// POST /api/google/desconectar  { requester_id }
// Desliga dos dois lados (revoga no Google) e tira da agenda o que veio
// de lá — compromisso que não vai mais ser atualizado não deve ficar
// parecendo atual.
router.post('/desconectar', async (req, res) => {
  const userId = req.usuario.id;
  const { data: conexao } = await supabase.from('google_conexoes').select('refresh_token_cifrado').eq('user_id', userId).maybeSingle();
  if (conexao) {
    try { await G.revogar(G.decifrar(conexao.refresh_token_cifrado)); } catch { /* chave antiga ou já revogada */ }
    await supabase.from('google_conexoes').delete().eq('user_id', userId);
  }
  await supabase.from('agenda_items').delete().eq('created_by', userId).eq('origem', 'google');
  registrarLog('desconectar_google', 'google_conexoes', 'sucesso', { user_id: userId });
  res.json({ ok: true });
});

// POST /api/google/sincronizar-todos   (agendamento, com x-cron-segredo)
// Uma pessoa por vez: são poucas, e em fila não estoura o limite do Google.
router.post('/sincronizar-todos', async (req, res) => {
  if (!G.configurado()) return res.json({ ok: true, configurado: false });
  const { data: conexoes } = await supabase.from('google_conexoes').select('user_id, ultimo_erro');
  const resumo = { ok: true, total: 0, sincronizadas: 0, reconectar: 0, erros: 0 };
  for (const c of conexoes || []) {
    // Conexão que o Google já recusou não volta sozinha — não insistir.
    if (c.ultimo_erro === 'reconectar') { resumo.reconectar++; continue; }
    resumo.total++;
    const r = await G.sincronizarUsuario(c.user_id);
    if (r.ok) resumo.sincronizadas++;
    else if (r.motivo === 'reconectar') resumo.reconectar++;
    else resumo.erros++;
  }
  res.json(resumo);
});

module.exports = router;
