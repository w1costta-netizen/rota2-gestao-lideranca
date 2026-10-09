const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../supabase');
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
const CORES = ['padrao', 'preto', 'cinza', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa'];
const corValida = c => (CORES.includes(c) ? c : 'padrao');

async function daPessoa(id, user_id) {
  const { data } = await supabase
    .from('anotacoes').select('id, user_id, titulo').eq('id', id).maybeSingle();
  return data && data.user_id === user_id ? data : null;
}

// ─── Anexos ──────────────────────────────────────────────────
// Fotos e arquivos presos numa anotação. Desenho igual ao dos anexos do
// chat e das evidências DEPOIS do conserto de out/2026:
//
//  • balde FECHADO; o banco guarda o CAMINHO e o servidor assina um link
//    de 1 hora na hora de mostrar;
//  • o arquivo sobe do aparelho direto para o armazenamento, com uma
//    autorização de um envio só emitida aqui — não gasta a banda do
//    servidor com foto;
//  • apagar a anotação ou o anexo APAGA O ARQUIVO. Foi arquivo esquecido
//    que encheu 1 GB e derrubou o app; aqui ele nasce sem esse defeito.
const BALDE = 'anotacoes';
const VALIDADE_LINK = 60 * 60;            // 1 hora
const LIMITE_ARQUIVO = 10 * 1024 * 1024;  // 10 MB — foto já chega comprimida
const LIMITE_POR_NOTA = 10;
// Foto, PDF e os documentos de escritório que um líder recebe. Áudio e
// vídeo ficam de fora de propósito: são os que mais pesam, e o ditado por
// voz já cobre o caso do áudio — virando texto que dá para pesquisar.
const TIPOS_ACEITOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Nome vindo do aparelho não entra cru no caminho: barra e ".." permitiriam
// gravar fora da pasta da anotação. Mesma regra do chat.
function nomeSeguro(nome) {
  return String(nome || 'arquivo')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(-80) || 'arquivo';
}

// Devolve o anexo do jeito que a tela usa — com link, sem o caminho
// interno. Um pedido só para todos os links: uma lista de anotações pode
// ter dezenas de fotos, e assinar uma a uma deixava a tela lenta.
async function comLinks(anexos) {
  if (!anexos?.length) return [];
  const { data } = await supabase.storage.from(BALDE)
    .createSignedUrls(anexos.map(a => a.caminho), VALIDADE_LINK);
  return anexos.map((a, i) => ({
    id: a.id,
    anotacao_id: a.anotacao_id,
    nome: a.nome,
    tipo: a.tipo,
    tamanho: a.tamanho,
    imagem: String(a.tipo || '').startsWith('image/'),
    url: data?.[i]?.signedUrl || null,
  }));
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

  const notas = data || [];
  // Os anexos são extra: se a leitura deles falhar, as anotações aparecem
  // assim mesmo, sem as fotos. Uma falha aqui não pode esconder o texto
  // que a pessoa escreveu.
  let anexos = [];
  if (notas.length) {
    const { data: lista, error: errAnexos } = await supabase
      .from('anotacao_anexos').select('*')
      .in('anotacao_id', notas.map(n => n.id))
      .order('created_at', { ascending: true });
    if (errAnexos) {
      registrarLog('listar_anexos_anotacao', 'anotacao_anexos', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: errAnexos.message });
    } else {
      anexos = await comLinks(lista);
    }
  }
  res.json(notas.map(n => ({ ...n, anexos: anexos.filter(a => a.anotacao_id === n.id) })));
});

// POST /api/anotacoes  { requester_id, titulo, texto, cor, rascunho }
router.post('/', async (req, res) => {
  const { requester_id, titulo, texto, cor, rascunho } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });
  // `rascunho`: a pessoa abriu uma anotação nova e já foi anexar uma foto,
  // antes de escrever qualquer coisa. O anexo precisa de uma anotação para
  // morar, então ela nasce vazia. Se fechar sem foto e sem texto, a tela
  // apaga — anotação vazia não fica para trás.
  if (!rascunho && !titulo?.trim() && !texto?.trim()) {
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
  res.json({ ...data, anexos: [] });
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

  // OS ARQUIVOS SAEM ANTES DA LINHA. O banco apaga os anexos em cascata,
  // mas cascata não alcança o armazenamento: sem isto, cada anotação
  // apagada deixava as fotos dela ocupando espaço para sempre — e agora
  // espaço é conta no fim do mês. Se não der para apagar os arquivos, a
  // anotação fica: melhor a pessoa tentar de novo do que lixo invisível.
  const { data: anexos } = await supabase
    .from('anotacao_anexos').select('caminho').eq('anotacao_id', req.params.id);
  if (anexos?.length) {
    const { error: errArq } = await supabase.storage.from(BALDE).remove(anexos.map(a => a.caminho));
    if (errArq) {
      registrarLog('excluir_anotacao', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: `anexos: ${errArq.message}` });
      return res.status(500).json({ error: 'Não foi possível apagar os anexos agora. Tente de novo.' });
    }
  }

  const { error } = await supabase.from('anotacoes').delete().eq('id', req.params.id);
  if (error) {
    registrarLog('excluir_anotacao', 'anotacoes', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Erro ao excluir a anotação.' });
  }
  registrarLog('excluir_anotacao', 'anotacoes', 'sucesso', { user_id: requester_id, antes: { id: req.params.id, anexos: anexos?.length || 0 } });
  res.json({ ok: true });
});

// POST /api/anotacoes/:id/anexos/autorizar  { requester_id, nome, tamanho, tipo }
// Autoriza UM envio e devolve para onde mandar o arquivo. O arquivo vai
// do aparelho direto para o armazenamento.
router.post('/:id/anexos/autorizar', async (req, res) => {
  const { requester_id, nome, tamanho, tipo } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const minha = await daPessoa(req.params.id, requester_id);
  if (!minha) return res.status(404).json({ error: 'Anotação não encontrada' });

  if (!TIPOS_ACEITOS.includes(tipo)) {
    return res.status(400).json({ error: 'Esse tipo de arquivo não pode ser anexado. Use foto, PDF, Word ou Excel.' });
  }
  if (Number(tamanho) > LIMITE_ARQUIVO) {
    return res.status(413).json({ error: `Arquivo muito grande. O limite é ${LIMITE_ARQUIVO / 1024 / 1024} MB.` });
  }
  const { count } = await supabase.from('anotacao_anexos')
    .select('id', { count: 'exact', head: true }).eq('anotacao_id', req.params.id);
  if ((count || 0) >= LIMITE_POR_NOTA) {
    return res.status(400).json({ error: `Cada anotação guarda até ${LIMITE_POR_NOTA} anexos.` });
  }

  // A pasta é da PESSOA: anotação é pessoal, não da loja.
  const caminho = `${requester_id}/${req.params.id}/${Date.now()}-${nomeSeguro(nome)}`;
  const { data, error } = await supabase.storage.from(BALDE).createSignedUploadUrl(caminho);
  if (error) {
    registrarLog('anexar_anotacao', 'anotacao_anexos', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível preparar o envio.' });
  }
  res.json({ caminho, url: data.signedUrl, token: data.token });
});

// POST /api/anotacoes/:id/anexos  { requester_id, caminho, nome, tipo, tamanho }
// Registra o anexo depois que o arquivo subiu.
router.post('/:id/anexos', async (req, res) => {
  const { requester_id, caminho, nome, tipo, tamanho } = req.body || {};
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const minha = await daPessoa(req.params.id, requester_id);
  if (!minha) return res.status(404).json({ error: 'Anotação não encontrada' });

  // O CAMINHO TEM QUE SER DA PASTA DESTA PESSOA E DESTA ANOTAÇÃO. Sem esta
  // trava, bastava registrar o caminho do arquivo de outra pessoa para
  // receber, no próximo carregamento, um link assinado para ele.
  if (typeof caminho !== 'string' || !caminho.startsWith(`${requester_id}/${req.params.id}/`) || caminho.includes('..')) {
    return res.status(400).json({ error: 'Anexo inválido.' });
  }
  if (!TIPOS_ACEITOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de arquivo não aceito.' });

  const { data, error } = await supabase.from('anotacao_anexos').insert({
    anotacao_id: req.params.id,
    user_id: requester_id,
    caminho,
    nome: String(nome || '').slice(0, 120),
    tipo,
    tamanho: Number(tamanho) || 0,
  }).select().single();

  if (error) {
    // A linha não entrou, então o arquivo que acabou de subir ficaria órfão.
    // Tira ele daqui mesmo.
    await supabase.storage.from(BALDE).remove([caminho]).catch(() => {});
    registrarLog('anexar_anotacao', 'anotacao_anexos', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: error.message });
    return res.status(500).json({ error: 'Não foi possível guardar o anexo.' });
  }
  // Mexer nos anexos conta como mexer na anotação: ela sobe na lista.
  await supabase.from('anotacoes').update({ updated_at: new Date().toISOString() }).eq('id', req.params.id);
  registrarLog('anexar_anotacao', 'anotacao_anexos', 'sucesso', { user_id: requester_id, depois: { anotacao_id: req.params.id, tipo, tamanho } });
  const [comLink] = await comLinks([data]);
  res.json(comLink);
});

// DELETE /api/anotacoes/:id/anexos/:anexoId?requester_id=
router.delete('/:id/anexos/:anexoId', async (req, res) => {
  const { requester_id } = req.query;
  if (!requester_id) return res.status(401).json({ error: 'requester_id obrigatório' });

  const minha = await daPessoa(req.params.id, requester_id);
  if (!minha) return res.status(404).json({ error: 'Anotação não encontrada' });

  const { data: anexo } = await supabase.from('anotacao_anexos')
    .select('id, caminho').eq('id', req.params.anexoId).eq('anotacao_id', req.params.id).maybeSingle();
  if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado' });

  // Arquivo primeiro: se falhar, a linha continua e dá para tentar de novo.
  // Ao contrário, sobrava um arquivo que nenhuma tela mostra.
  const { error: errArq } = await supabase.storage.from(BALDE).remove([anexo.caminho]);
  if (errArq) {
    registrarLog('remover_anexo_anotacao', 'anotacao_anexos', 'erro', { user_id: requester_id, rota: req.originalUrl, erro: errArq.message });
    return res.status(500).json({ error: 'Não foi possível apagar o arquivo agora.' });
  }
  await supabase.from('anotacao_anexos').delete().eq('id', anexo.id);
  registrarLog('remover_anexo_anotacao', 'anotacao_anexos', 'sucesso', { user_id: requester_id, antes: { anotacao_id: req.params.id } });
  res.json({ ok: true });
});

// ─── Ler o texto de uma foto ─────────────────────────────────
// A pessoa fotografa um papel, um quadro, uma etiqueta — e o texto vira
// texto digitado na anotação, que dá para editar e pesquisar. É o
// "Escanear Texto" do iPhone.
//
// Nada é guardado aqui: a foto vem, é lida e vai embora. Quem quiser
// guardar a foto também, anexa.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const INSTRUCAO_LER_TEXTO =
  'Transcreva todo o texto legível desta imagem, exatamente como está escrito: mesmo idioma, ' +
  'mesma grafia, mesmos números. Mantenha as quebras de linha e a ordem de leitura; o que for ' +
  'lista continua lista. Não resuma, não traduza, não corrija e não comente — devolva só o texto ' +
  'transcrito. Se não houver texto legível na imagem, responda apenas: SEM_TEXTO';

// Cada leitura custa dinheiro de IA. O teto por pessoa e por dia impede que
// um laço na tela, ou alguém insistindo, vire uma conta grande. Fica na
// memória do servidor: zera quando ele reinicia, o que está bom para um
// freio — não é cobrança.
const LEITURAS_POR_DIA = 40;
const leiturasHoje = new Map();
function podeLer(userId) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const reg = leiturasHoje.get(userId);
  if (!reg || reg.dia !== hoje) { leiturasHoje.set(userId, { dia: hoje, n: 1 }); return true; }
  if (reg.n >= LEITURAS_POR_DIA) return false;
  reg.n += 1;
  return true;
}

// POST /api/anotacoes/ler-texto  (multipart: foto)
router.post('/ler-texto', upload.single('foto'), async (req, res) => {
  // Rota de arquivo: o corpo não está lido quando a checagem de sessão
  // roda, então quem vale aqui é o dono do token, não um id do formulário.
  const userId = req.usuario?.id;
  if (!userId) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
  if (!req.file) return res.status(400).json({ error: 'Envie uma foto.' });
  if (!TIPOS_FOTO.includes(req.file.mimetype)) return res.status(400).json({ error: 'Envie uma foto (JPG ou PNG).' });
  if (!podeLer(userId)) {
    return res.status(429).json({ error: `Você chegou ao limite de ${LEITURAS_POR_DIA} leituras de texto por hoje.` });
  }

  try {
    // `fallbacks: 'default'`: se a IA recusar a leitura por engano (os
    // filtros de segurança às vezes erram), outro modelo tenta na mesma
    // chamada, em vez de a pessoa receber um "não consegui".
    // Esforço baixo: transcrever é tarefa direta, não precisa pensar muito
    // — e esforço é o que mais pesa no custo de cada leitura.
    const resposta = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
          { type: 'text', text: INSTRUCAO_LER_TEXTO },
        ],
      }],
    });

    if (resposta.stop_reason === 'refusal') {
      registrarLog('ler_texto_anotacao', 'anotacoes', 'erro', { user_id: userId, rota: req.originalUrl, erro: `recusado: ${resposta.stop_details?.category || '?'}` });
      return res.status(422).json({ error: 'Não consegui ler esta foto. Tente outra.' });
    }

    // Só os blocos de texto: a resposta também traz blocos de raciocínio e,
    // se houve troca de modelo, uma marca da troca — nada disso é o texto.
    const texto = resposta.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // O texto lido NÃO vai para o log: a anotação é pessoal.
    registrarLog('ler_texto_anotacao', 'anotacoes', 'sucesso', {
      user_id: userId,
      depois: { caracteres: texto.length, modelo: resposta.model, tokens_saida: resposta.usage?.output_tokens },
    });

    if (!texto || texto === 'SEM_TEXTO') return res.json({ texto: '', vazio: true });
    res.json({ texto, cortado: resposta.stop_reason === 'max_tokens' });
  } catch (e) {
    // Do mais específico para o mais geral: cada um pede uma resposta
    // diferente para a pessoa.
    let status = 500;
    let msg = 'Não foi possível ler o texto agora.';
    if (e instanceof Anthropic.RateLimitError) {
      status = 429; msg = 'A leitura de texto está ocupada. Tente em um minuto.';
    } else if (e instanceof Anthropic.BadRequestError) {
      status = 400; msg = 'Não consegui processar esta imagem. Tente outra foto.';
    } else if (e instanceof Anthropic.APIError) {
      status = 502; msg = 'A leitura de texto está fora do ar agora. Tente mais tarde.';
    }
    registrarLog('ler_texto_anotacao', 'anotacoes', 'erro', {
      user_id: userId, rota: req.originalUrl, erro: `${e?.status || ''} ${e?.message || e}`.trim(),
    });
    res.status(status).json({ error: msg });
  }
});

module.exports = router;
