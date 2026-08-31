const express  = require('express');
const router   = express.Router();
const supabase = require('../supabase');
const { registrarLog } = require('../lib/auditLog');
const { enviarPush } = require('../lib/notificacoes');

// ─────────────────────────────────────────────────────────────
// Conversas — chat entre duas pessoas da mesma loja.
//
// Toda rota confere que quem pede faz parte da conversa. Sem isso bastaria
// trocar o id na chamada para ler a conversa alheia — e conversa privada é
// o dado mais sensível que este app guarda.
// ─────────────────────────────────────────────────────────────

const LIMITE_TEXTO = 2000;

// ─── Anexos ──────────────────────────────────────────────────
// O arquivo NÃO passa pelo servidor: ele sobe direto do aparelho para o
// armazenamento, com uma autorização temporária que o servidor emite. Isso
// evita gastar a banda do servidor (plano gratuito) com áudio e foto.
//
// O espaço é FECHADO. Para ler, o servidor gera um link temporário — e só
// depois de confirmar que quem pediu participa da conversa.
const BALDE = 'chat';
const VALIDADE_LINK = 60 * 60; // 1 hora: tempo de sobra para ver e baixar

// Limite por arquivo. Existe por causa do custo: o plano do banco dá 1GB no
// total, e sem teto um vídeo de alguns minutos consome isso sozinho.
const LIMITE_ARQUIVO = 20 * 1024 * 1024; // 20 MB

const TIPOS = ['texto', 'imagem', 'arquivo', 'audio'];

// Nome de arquivo vindo do aparelho não entra no caminho de armazenamento:
// barra e ".." permitiriam gravar fora da pasta da conversa.
function nomeSeguro(nome) {
  return String(nome || 'arquivo')
    .replace(/[^\w.\- ]+/g, '_')   // tira barra e tudo que não é comum em nome
    .replace(/\.{2,}/g, '.')       // colapsa ".." — sem barra ele já não sobe
    .replace(/\s+/g, '_')          // pasta, mas não deixa dúvida na leitura
    .replace(/^[._-]+/, '')        // não começa por ponto: evita arquivo oculto
    .slice(-80) || 'arquivo';
}

async function linkTemporario(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BALDE).createSignedUrl(path, VALIDADE_LINK);
  return data?.signedUrl || null;
}

// O id vai cru dentro de uma string de filtro (.or) mais abaixo. Conferir o
// formato antes fecha a porta para alguém montar um filtro próprio e ler
// conversa alheia. Mesma proteção já usada em tarefas.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPerfil(id) {
  if (!UUID.test(String(id || ''))) return null;
  const { data } = await supabase
    .from('profiles').select('id, company, full_name, avatar_url, active, access_level').eq('id', id).maybeSingle();
  return data || null;
}

// O par sempre em ordem: é o que garante uma única conversa entre duas
// pessoas, independente de quem começou a falar.
const parOrdenado = (x, y) => (x < y ? [x, y] : [y, x]);

// Dados da conversa do ponto de vista de quem está pedindo: quem é o outro,
// e quantas mensagens não lidas são SUAS.
function comoVista(conversa, euId) {
  const souA = conversa.usuario_a === euId;
  return {
    id: conversa.id,
    outro_id: souA ? conversa.usuario_b : conversa.usuario_a,
    ultima_texto: conversa.ultima_texto,
    ultima_em: conversa.ultima_em,
    ultima_minha: conversa.ultima_de === euId,
    nao_lidas: souA ? conversa.nao_lidas_a : conversa.nao_lidas_b,
  };
}

async function minhaConversa(conversaId, euId) {
  const { data } = await supabase
    .from('conversas').select('*').eq('id', conversaId).maybeSingle();
  if (!data) return null;
  if (data.usuario_a !== euId && data.usuario_b !== euId) return null;
  return data;
}

// GET /api/chat/contatos?requester_id= — com quem posso falar
router.get('/contatos', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json([]);

  const { data, error } = await supabase
    .from('profiles').select('id, full_name, avatar_url, role, sector')
    .eq('company', me.company).eq('active', true)
    .neq('id', me.id)
    .order('full_name');
  if (error) return res.status(500).json({ error: 'Erro ao carregar os contatos.' });

  // O master também fala com o responsável de cada loja cliente. É o canal
  // de suporte: sem ele, quem contrata o sistema não tem como ser atendido
  // por dentro do próprio app.
  //
  // A abertura é estreita de propósito e vale SÓ para o master: apenas os
  // responsáveis (admin) das outras lojas, nunca a equipe inteira delas. E
  // é de mão única — a lista de contatos de cada loja continua sendo só a
  // gente dela, então ninguém de uma loja enxerga alguém de outra por aqui.
  let deOutrasLojas = [];
  if (me.access_level === 'master') {
    const { data: donos } = await supabase
      .from('profiles').select('id, full_name, avatar_url, role, sector, company')
      .eq('access_level', 'admin').eq('active', true)
      .neq('company', me.company)
      .order('full_name');
    deOutrasLojas = (donos || []).map(d => ({ ...d, de_outra_loja: true }));
  }

  res.json([...(data || []), ...deOutrasLojas]);
});

// GET /api/chat/conversas?requester_id= — a lista, com a última mensagem
router.get('/conversas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data, error } = await supabase
    .from('conversas').select('*')
    .or(`usuario_a.eq.${me.id},usuario_b.eq.${me.id}`)
    .order('ultima_em', { ascending: false, nullsFirst: false });
  if (error) return res.status(500).json({ error: 'Erro ao carregar as conversas.' });

  const vistas = (data || []).map(c => comoVista(c, me.id));
  if (!vistas.length) return res.json([]);

  // Uma consulta só para todos os nomes, em vez de uma por conversa.
  const { data: pessoas } = await supabase
    .from('profiles').select('id, full_name, avatar_url, role')
    .in('id', vistas.map(v => v.outro_id));
  const porId = Object.fromEntries((pessoas || []).map(p => [p.id, p]));

  res.json(vistas.map(v => ({ ...v, outro: porId[v.outro_id] || null })));
});

// POST /api/chat/conversas  { requester_id, com_id } — abre (ou reencontra)
router.post('/conversas', async (req, res) => {
  const { requester_id, com_id } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!com_id || com_id === requester_id) return res.status(400).json({ error: 'Escolha outra pessoa.' });

  const outro = await getPerfil(com_id);
  if (!outro || !outro.active) return res.status(404).json({ error: 'Pessoa não encontrada' });
  // Regra que sustenta a privacidade entre clientes: conversa só dentro da
  // mesma loja. A única exceção é o master falando com outra loja — o canal
  // de suporte. Continua valendo para todo o resto, inclusive para impedir
  // que alguém de uma loja procure alguém de outra.
  const suporte = me.access_level === 'master' || outro.access_level === 'master';
  if (outro.company !== me.company && !suporte) {
    return res.status(403).json({ error: 'Só é possível conversar com alguém da mesma loja.' });
  }

  // A conversa fica registrada na loja do cliente, não na do master: é lá
  // que o atendimento aconteceu, e é lá que faz sentido procurar depois.
  const lojaDaConversa = me.access_level === 'master' ? (outro.company || me.company) : me.company;

  const [a, b] = parOrdenado(me.id, outro.id);
  const { data: existente } = await supabase
    .from('conversas').select('*').eq('usuario_a', a).eq('usuario_b', b).maybeSingle();
  if (existente) return res.json({ ...comoVista(existente, me.id), outro });

  const { data: nova, error } = await supabase
    .from('conversas').insert({ company: lojaDaConversa, usuario_a: a, usuario_b: b }).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao abrir a conversa.' });
  res.json({ ...comoVista(nova, me.id), outro });
});

// GET /api/chat/conversas/:id/mensagens?requester_id=&depois=
//
// `depois` é o que torna a atualização barata: a cada poucos segundos a tela
// pede só o que chegou depois da última mensagem que ela já mostra.
router.get('/conversas/:id/mensagens', async (req, res) => {
  const { requester_id, depois } = req.query;
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const conversa = await minhaConversa(req.params.id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  // `depois` entra cru numa string de filtro, então só passa se for uma data
  // válida — mesma precaução usada com o identificador.
  const desde = depois && !isNaN(Date.parse(depois)) ? new Date(depois).toISOString() : null;

  let consulta = supabase
    .from('mensagens')
    .select('id, de_id, texto, tipo, apagada, arquivo_path, arquivo_nome, arquivo_tamanho, duracao, created_at')
    .eq('conversa_id', conversa.id);

  // Traz o que é novo E o que mudou. Sem a segunda parte, uma mensagem
  // apagada nunca sumiria da tela de quem está do outro lado — que é
  // justamente o motivo de alguém apagar.
  if (desde) consulta = consulta.or(`created_at.gt.${desde},atualizada_em.gt.${desde}`);

  const { data, error } = await consulta.order('created_at', { ascending: true }).limit(300);
  if (error) return res.status(500).json({ error: 'Erro ao carregar as mensagens.' });

  // O link do anexo é gerado AGORA e vale por uma hora. O caminho do arquivo
  // nunca sai daqui: sem link temporário não há como abrir o anexo, mesmo
  // conhecendo o endereço do armazenamento.
  const comLink = await Promise.all((data || []).map(async m => {
    const { arquivo_path, ...resto } = m;
    return { ...resto, arquivo_url: arquivo_path ? await linkTemporario(arquivo_path) : null };
  }));
  res.json(comLink);
});

// POST /api/chat/anexo  { requester_id, conversa_id, nome, tamanho }
// Autoriza o envio de UM arquivo e devolve para onde mandá-lo. O arquivo em
// si vai do aparelho direto para o armazenamento, sem passar pelo servidor.
router.post('/anexo', async (req, res) => {
  const { requester_id, conversa_id, nome, tamanho } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const conversa = await minhaConversa(conversa_id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  if (Number(tamanho) > LIMITE_ARQUIVO) {
    return res.status(413).json({ error: `Arquivo muito grande. O limite é ${LIMITE_ARQUIVO / 1024 / 1024} MB.` });
  }

  // O caminho começa pelo id da conversa: mantém os arquivos separados por
  // conversa e facilita apagar tudo junto se ela for removida.
  const path = `${conversa.id}/${Date.now()}-${nomeSeguro(nome)}`;
  const { data, error } = await supabase.storage.from(BALDE).createSignedUploadUrl(path);
  if (error) {
    registrarLog('enviar_anexo', 'mensagens', 'erro', { company: conversa.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível preparar o envio.' });
  }
  res.json({ path, url: data.signedUrl, token: data.token });
});

// POST /api/chat/mensagens  { requester_id, conversa_id, texto }
router.post('/mensagens', async (req, res) => {
  const { requester_id, conversa_id, texto, tipo, arquivo_path, arquivo_nome, arquivo_tamanho, duracao } = req.body || {};
  const me = await getPerfil(requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const oTipo = TIPOS.includes(tipo) ? tipo : 'texto';
  // Mensagem de texto precisa de texto; a de arquivo precisa do arquivo. A
  // legenda continua opcional nas de arquivo.
  if (oTipo === 'texto' && !texto?.trim()) return res.status(400).json({ error: 'Escreva a mensagem.' });
  if (oTipo !== 'texto' && !arquivo_path)  return res.status(400).json({ error: 'Anexo não enviado.' });

  const conversa = await minhaConversa(conversa_id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  // O caminho do arquivo tem que ser desta conversa. Sem esta conferência,
  // alguém poderia apontar uma mensagem para o anexo de outra conversa e
  // receber um link válido para ele.
  if (arquivo_path && !String(arquivo_path).startsWith(`${conversa.id}/`)) {
    return res.status(400).json({ error: 'Anexo inválido.' });
  }

  const limpo = (texto || '').trim().slice(0, LIMITE_TEXTO);
  const { data: msg, error } = await supabase.from('mensagens')
    .insert({
      conversa_id: conversa.id, de_id: me.id, texto: limpo, tipo: oTipo,
      arquivo_path: arquivo_path || null,
      arquivo_nome: arquivo_nome ? nomeSeguro(arquivo_nome) : null,
      arquivo_tamanho: arquivo_tamanho || null,
      duracao: duracao || null,
    })
    .select('id, de_id, texto, tipo, apagada, arquivo_path, arquivo_nome, arquivo_tamanho, duracao, created_at').single();

  if (error) {
    registrarLog('enviar_mensagem', 'mensagens', 'erro', { company: conversa.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao enviar.' });
  }

  // Atualiza o resumo da conversa e soma uma não lida para o OUTRO lado.
  const souA = conversa.usuario_a === me.id;
  const outroId = souA ? conversa.usuario_b : conversa.usuario_a;

  // Na lista de conversas e na notificação, anexo sem legenda vira um
  // rótulo. Sem isso a última mensagem apareceria em branco e a pessoa não
  // saberia que recebeu alguma coisa.
  const rotulo = { imagem: '📷 Foto', arquivo: '📎 Arquivo', audio: '🎤 Áudio' };
  const resumo = limpo || rotulo[oTipo] || '';

  await supabase.from('conversas').update({
    ultima_texto: resumo.slice(0, 140),
    ultima_de: me.id,
    ultima_em: msg.created_at,
    ...(souA
      ? { nao_lidas_b: (conversa.nao_lidas_b || 0) + 1 }
      : { nao_lidas_a: (conversa.nao_lidas_a || 0) + 1 }),
  }).eq('id', conversa.id);

  // O conteúdo NÃO entra no log: conversa privada não é para ser lida por
  // quem audita. Fica só o registro de que houve troca de mensagem.
  registrarLog('enviar_mensagem', 'mensagens', 'sucesso', {
    company: conversa.company, user_id: me.id, depois: { conversa_id: conversa.id },
  });

  // O push é o que faz o chat funcionar de verdade: sem ele a pessoa só
  // descobre a mensagem se abrir o app por conta própria.
  enviarPush(outroId, `💬 ${me.full_name || 'Mensagem'}`, resumo.slice(0, 120), 'chat',
    { company: conversa.company, rota: req.originalUrl });

  // A resposta devolve o LINK do anexo, não o caminho no armazenamento.
  // Quem envia coloca esta mensagem direto na tela, sem passar pela
  // listagem — sem o link aqui, o próprio remetente veria "anexo
  // indisponível" na foto que acabou de mandar.
  const { arquivo_path: caminhoGravado, ...semCaminho } = msg;
  res.json({ ...semCaminho, arquivo_url: await linkTemporario(caminhoGravado) });
});

// DELETE /api/chat/mensagens/:id?requester_id=
//
// Só quem escreveu apaga — nem gestor, nem master. Conversa privada de
// outra pessoa não é território de moderação.
//
// A mensagem não some: vira "apagada", como no WhatsApp. Sumir sem deixar
// rastro deixaria a conversa confusa para quem estava do outro lado.
router.delete('/mensagens/:id', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: msg } = await supabase
    .from('mensagens').select('id, de_id, conversa_id, arquivo_path').eq('id', req.params.id).maybeSingle();
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (msg.de_id !== me.id) return res.status(403).json({ error: 'Só quem enviou pode apagar.' });

  const conversa = await minhaConversa(msg.conversa_id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  // O arquivo sai do armazenamento de verdade. Sem isso ele continuaria
  // ocupando espaço para sempre — e o plano do banco tem 1GB no total.
  //
  // A falha aqui é registrada, e não engolida: apagar anexo é ação de
  // privacidade, e uma remoção que falha em silêncio deixaria o arquivo no
  // servidor enquanto todo mundo acredita que ele sumiu.
  if (msg.arquivo_path) {
    const { error: erroArquivo } = await supabase.storage.from(BALDE).remove([msg.arquivo_path]);
    if (erroArquivo) {
      registrarLog('apagar_mensagem', 'mensagens', 'erro', {
        company: conversa.company, user_id: me.id, rota: req.originalUrl,
        erro: `Mensagem apagada, mas o arquivo continua no armazenamento: ${erroArquivo.message}`,
      });
    }
  }

  const { error } = await supabase.from('mensagens').update({
    apagada: true, texto: '', tipo: 'texto',
    arquivo_path: null, arquivo_nome: null, arquivo_tamanho: null, duracao: null,
    // Marca a hora da mudança: é por este campo que a tela do outro lado
    // descobre que a mensagem foi apagada, sem precisar recarregar tudo.
    atualizada_em: new Date().toISOString(),
  }).eq('id', msg.id);

  if (error) {
    registrarLog('apagar_mensagem', 'mensagens', 'erro', { company: conversa.company, user_id: me.id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao apagar.' });
  }
  registrarLog('apagar_mensagem', 'mensagens', 'sucesso', { company: conversa.company, user_id: me.id, antes: { conversa_id: conversa.id } });

  // Se a apagada era a última, o resumo da conversa ficaria mostrando um
  // texto que não existe mais. Recalcula a partir da última que sobrou.
  const { data: ultima } = await supabase
    .from('mensagens').select('texto, tipo, de_id, apagada, created_at')
    .eq('conversa_id', conversa.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const rotulo = { imagem: '📷 Foto', arquivo: '📎 Arquivo', audio: '🎤 Áudio' };
  await supabase.from('conversas').update({
    ultima_texto: !ultima ? null
      : ultima.apagada ? 'Mensagem apagada'
      : (ultima.texto || rotulo[ultima.tipo] || ''),
    ultima_de: ultima?.de_id || null,
    ultima_em: ultima?.created_at || null,
  }).eq('id', conversa.id);

  res.json({ ok: true });
});

// POST /api/chat/conversas/:id/lida  { requester_id } — zera as minhas
router.post('/conversas/:id/lida', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const conversa = await minhaConversa(req.params.id, me.id);
  if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

  const campo = conversa.usuario_a === me.id ? 'nao_lidas_a' : 'nao_lidas_b';
  await supabase.from('conversas').update({ [campo]: 0 }).eq('id', conversa.id);
  res.json({ ok: true });
});

// GET /api/chat/nao-lidas?requester_id= — total, para o aviso no menu
router.get('/nao-lidas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.json({ total: 0 });

  const { data } = await supabase
    .from('conversas').select('usuario_a, usuario_b, nao_lidas_a, nao_lidas_b')
    .or(`usuario_a.eq.${me.id},usuario_b.eq.${me.id}`);

  const total = (data || []).reduce(
    (s, c) => s + (c.usuario_a === me.id ? c.nao_lidas_a : c.nao_lidas_b), 0
  );
  res.json({ total });
});

module.exports = router;
