const express = require('express');
const router  = express.Router();
const supabase = require('../supabase');
const { logAction, logError } = require('../lib/auditLog');
const { cadeiaDeSubordinados } = require('../lib/equipe');
const crypto = require('node:crypto');

// ─────────────────────────────────────────────────────────────
// Torneios entre setores e entre pessoas.
//
// REGRA CENTRAL: o placar NÃO é gravado. É calculado na hora, a partir do
// que o app já registra quando o trabalho acontece. Isso resolve os três
// motivos que costumam matar gamificação:
//
//  1. Ninguém digita ponto. Placar que depende de alguém alimentar planilha
//     dura até essa pessoa ficar ocupada numa semana.
//  2. Mudar o peso de uma família recalcula o passado inteiro, em vez de
//     deixar um histórico com duas regras misturadas.
//  3. Se a ideia não pegar, apagar a tabela de campanhas apaga tudo — sem
//     deixar pontuação espalhada pelo banco.
//
// O OBJETIVO É HÁBITO, NÃO VOLUME. Quem faz 50 coisas numa terça não pode
// ganhar de quem faz 3 coisas todos os dias — o segundo é exatamente quem
// o torneio quer premiar. Daí as duas travas: teto por dia em cada ação, e
// uma família inteira que pontua DIAS DISTINTOS de uso. Ninguém falsifica
// vinte dias diferentes numa tarde.
// ─────────────────────────────────────────────────────────────

// Ações que pontuam, vindas do registro de auditoria — que já grava mais de
// cem ações do app com quem fez e quando.
//
// LISTA JUSTA (decisão do dono do produto, 18/09/2026): só entra o que
// QUALQUER pessoa da loja pode fazer. Importar estoque, conferência de
// seção, análise de caixas, flyer e Tour 4x4 ficaram de fora — são função de
// alguns cargos, e quem as tem ganhava "de graça" de quem trabalha no salão.
// Criar tarefa, lista e anotação também saíram: planejamento próprio é bom,
// mas pontuar a criação premiava volume, não entrega. O que mede entrega
// está na família QUALIDADE (prazo cumprido), que é a que vale mais.
//
// NAVEGAÇÃO NÃO PONTUA de propósito. Premiar quem abre tela ensina a abrir
// tela. O que mede a mesma intenção é a constância.
const ACOES = {
  // Comunicação — teto baixo de propósito: é o mais fácil de inflar
  marcar_comunicado_lido:  { nome: 'Ler um comunicado', familia: 'participacao', base: 1, tetoDia: 5 },
  marcar_mural_lido:       { nome: 'Ler o mural', familia: 'participacao', base: 1, tetoDia: 3 },
  comentar_tarefa:         { nome: 'Comentar numa tarefa', familia: 'participacao', base: 2, tetoDia: 3 },
  comentar_comunicado:     { nome: 'Comentar num comunicado', familia: 'participacao', base: 2, tetoDia: 3 },
  comentar_mural:          { nome: 'Comentar no mural', familia: 'participacao', base: 2, tetoDia: 3 },
  comentar_ata:            { nome: 'Comentar numa ata', familia: 'participacao', base: 2, tetoDia: 3 },
  comentar_diario:         { nome: 'Comentar no Diário de Bordo', familia: 'participacao', base: 2, tetoDia: 3 },
  reagir:                  { nome: 'Reagir a uma publicação', familia: 'participacao', base: 1, tetoDia: 5 },
  enviar_mensagem:         { nome: 'Enviar mensagem no chat', familia: 'participacao', base: 1, tetoDia: 5 },
  concluir_treinamento_produtividade: { nome: 'Concluir um treinamento', familia: 'participacao', base: 10, tetoDia: 2 },
};

// Ações que contam DIA ATIVO mas não dão ponto por si: fazer o trabalho
// (criar tarefa, escrever no diário, mexer na escala) marca presença; o
// ponto vem quando a entrega cumpre o prazo, na família Qualidade.
const ACOES_PRESENCA = [
  'criar_tarefa', 'editar_tarefa', 'criar_agenda', 'criar_relato_diario', 'criar_ata', 'assinar_ata',
  'salvar_escala', 'enviar_escala', 'criar_plano_pdca', 'criar_acao_pdca', 'editar_acao_pdca',
  'criar_lista', 'adicionar_item_lista', 'criar_anotacao',
];
const ACOES_DO_LOG = [...new Set([...Object.keys(ACOES), ...ACOES_PRESENCA])];

// Vale por cada dia distinto em que a pessoa fez qualquer coisa da lista.
// É a métrica mais resistente a fraude que existe aqui, e a que mede o que
// o torneio realmente quer: aparecer todo dia.
const PONTOS_POR_DIA_ATIVO = 5;

const FAMILIAS = {
  constancia:   { nome: 'Constância',        descricao: 'Cada dia em que a pessoa usou o app de verdade' },
  qualidade:    { nome: 'Entregas no prazo', descricao: 'Tarefa, ação do plano, ata, diário, comunicado e escala dentro do prazo' },
  participacao: { nome: 'Comunicação',       descricao: 'Ler, comentar, reagir, conversar e concluir treinamentos' },
};

const diaDe    = (iso) => new Date(iso).toISOString().slice(0, 10);
const mesmoDia = (a, b) => diaDe(a) === diaDe(b);
// O período vem em datas; sem isto o último dia ficaria de fora, porque
// qualquer horário depois da meia-noite já é maior que a data pura.
const fimDoDia = (data) => `${data}T23:59:59.999Z`;

function contagem(linhas, vale, campo = 'user_id') {
  const por = {};
  (linhas || []).forEach(r => {
    if (!vale(r)) return;
    por[r[campo]] = (por[r[campo]] || 0) + 1;
  });
  return por;
}

// Qualidade fica fora do registro de auditoria porque "no prazo" não é uma
// ação: é a comparação entre duas datas. São as de maior valor — medem
// fazer BEM, não apenas fazer — e as mais difíceis de forjar, porque fingir
// dá o mesmo trabalho que cumprir.
const QUALIDADE = {
  escala_no_prazo: {
    nome: 'Escala enviada até o dia 26', base: 10,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('schedule_submissions').select('user_id, submitted_at')
        .in('user_id', ids).gte('submitted_at', inicio).lte('submitted_at', fimDoDia(fim));
      return contagem(data, r => new Date(r.submitted_at).getDate() <= 26);
    },
  },
  tarefa_no_prazo: {
    nome: 'Tarefa concluída dentro do prazo', base: 5,
    async contar(ids, inicio, fim) {
      // A rota de tarefas grava `status` e `updated_at` — não existe
      // `concluida_em`. Lendo a coluna errada, esta regra nunca pontuou.
      const { data } = await supabase
        .from('tarefas').select('assigned_to, due_date, status, updated_at')
        .in('assigned_to', ids).eq('status', 'concluida')
        .gte('updated_at', inicio).lte('updated_at', fimDoDia(fim));
      // Sem prazo definido não há mérito de prazo: não pontua, senão
      // premiaria quem cria tarefa sem data e fecha na hora.
      return contagem(data, r => r.due_date && diaDe(r.updated_at) <= r.due_date, 'assigned_to');
    },
  },
  acao_pdca_no_prazo: {
    nome: 'Ação do plano de ação concluída no prazo', base: 6,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('acoes_pdca').select('responsavel_id, prazo, concluida_em')
        .in('responsavel_id', ids).eq('concluida', true)
        .gte('concluida_em', inicio).lte('concluida_em', fimDoDia(fim));
      return contagem(data, r => r.prazo && diaDe(r.concluida_em) <= r.prazo, 'responsavel_id');
    },
  },
  ata_assinada: {
    nome: 'Ata assinada em até 48h', base: 5,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('ata_assinaturas').select('user_id, assinado_em, atas_reuniao(created_at)')
        .in('user_id', ids).gte('assinado_em', inicio).lte('assinado_em', fimDoDia(fim));
      return contagem(data, r => {
        const criada = r.atas_reuniao?.created_at;
        if (!criada) return false;
        return (new Date(r.assinado_em) - new Date(criada)) <= 48 * 3600 * 1000;
      });
    },
  },
  diario_do_dia: {
    nome: 'Diário de bordo preenchido no dia', base: 4,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('diario_bordo').select('user_id, data, created_at')
        .in('user_id', ids).gte('data', inicio).lte('data', fim);
      return contagem(data, r => diaDe(r.created_at) === r.data);
    },
  },
  comunicado_lido_no_dia: {
    nome: 'Comunicado lido no mesmo dia', base: 3,
    async contar(ids, inicio, fim) {
      const { data } = await supabase
        .from('comunicados_lidos').select('user_id, read_at, comunicados(created_at)')
        .in('user_id', ids).gte('read_at', inicio).lte('read_at', fimDoDia(fim));
      return contagem(data, r =>
        r.comunicados?.created_at && mesmoDia(r.read_at, r.comunicados.created_at));
    },
  },
};

async function getPerfil(id) {
  if (!id) return null;
  const { data } = await supabase
    .from('profiles').select('id, company, access_level, active').eq('id', id).maybeSingle();
  if (!data || data.active === false) return null;
  return data;
}

const podeCriar = (me) => ['admin', 'master'].includes(me.access_level);

// ─── Campanha por OBJETIVO ──────────────────────────────────────────
//
// Além da automática (pontos do log), o líder cria campanha com metas de
// RESULTADO — venda do setor, ruptura, perda, atrasos — e lança a apuração.
// O que o mercado mostra que funciona em incentivo de varejo: meta numérica
// clara, prazo curto, apuração visível e resultado lançado por quem responde
// pelo número (o apurador), nunca pelo próprio participante.
//
// TETO DE 120%: uma meta estourada não decide a campanha sozinha.
// PROPORCIONAL: quem faz 55 de 50 (110%) empata com quem faz 110 de 100.
const TETO_ATINGIMENTO = 1.2;
const TIPOS = ['automatica', 'objetivo', 'mista'];
const FREQUENCIAS = { semanal: 'toda semana', quinzenal: 'a cada 15 dias', mensal: 'todo mês', final: 'no fim da campanha' };
const UNIDADES = ['R$', '%', 'un', 'pontos', 'ocorrências', 'horas'];

function validarObjetivos(lista) {
  const objetivos = (Array.isArray(lista) ? lista : []).slice(0, 5).map(o => ({
    id: /^[0-9a-f-]{36}$/i.test(o?.id || '') ? o.id : crypto.randomUUID(),
    nome: String(o?.nome || '').trim().slice(0, 80),
    unidade: UNIDADES.includes(o?.unidade) ? o.unidade : 'un',
    alvo: Number(o?.alvo),
    direcao: o?.direcao === 'menor' ? 'menor' : 'maior',
    apuracao: o?.apuracao === 'ultimo' ? 'ultimo' : 'soma',
    peso: Math.min(Math.max(parseInt(o?.peso, 10) || 1, 1), 5),
  }));
  const invalido = objetivos.find(o => !o.nome || !(o.alvo > 0));
  if (invalido) return { erro: 'Cada objetivo precisa de nome e meta maior que zero.' };
  return { objetivos };
}

// Valor apurado por objetivo e participante: soma dos lançamentos ou o
// último (por data de referência, depois por data de lançamento).
function apurar(objetivo, lancamentos) {
  if (!lancamentos.length) return null;
  if (objetivo.apuracao === 'soma') return lancamentos.reduce((t, l) => t + Number(l.valor || 0), 0);
  const ordenados = [...lancamentos].sort((a, b) =>
    String(a.periodo_ref || '').localeCompare(String(b.periodo_ref || '')) || String(a.created_at).localeCompare(String(b.created_at)));
  return Number(ordenados[ordenados.length - 1].valor || 0);
}

function atingimentoDe(objetivo, valor) {
  if (valor == null) return null;
  const alvo = Number(objetivo.alvo);
  let a;
  if (objetivo.direcao === 'maior') a = alvo > 0 ? valor / alvo : 0;
  else a = valor <= 0 ? TETO_ATINGIMENTO : alvo / valor;   // menor é melhor: zero ocorrências estoura a meta
  return Math.min(TETO_ATINGIMENTO, Math.max(0, a));
}

// Quem pode lançar resultado: criador, apuradores escolhidos, admin/master.
const ehApurador = (campanha, me) =>
  campanha.criado_por === me.id || (campanha.apuradores || []).includes(me.id) || podeCriar(me);

// Quem pode ver a campanha: loja inteira vê as de escopo 'loja'; as de
// equipe só quem participa, criou, apura ou administra.
const podeVer = (campanha, me) =>
  campanha.escopo !== 'equipe' || ehApurador(campanha, me) || (campanha.participantes || []).includes(me.id);
const FAMILIAS_VALIDAS = Object.keys(FAMILIAS);
const TEMAS_VALIDOS = ['classico', 'reinos', 'copa', 'corrida'];

// ─── Equipes do torneio ─────────────────────────────────────────────
//
// Equipe pertence a LOJA, nao a campanha: monta uma vez e vale para todos
// os torneios, com edicao quando alguem muda de time. Amarrar a equipe a
// campanha obrigaria a redistribuir 22 pessoas a cada torneio, e essa e
// exatamente a friccao que faria o recurso parar de ser usado no segundo
// mes.

// GET /api/gamificacao/equipes?requester_id=
router.get('/equipes', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuario nao encontrado' });
  if (!me.company) return res.json({ equipes: [], semEquipe: [] });

  const { data: equipes } = await supabase
    .from('equipes_torneio').select('*').eq('company', me.company).order('nome');

  const { data: pessoas } = await supabase
    .from('profiles').select('id, full_name, sector, avatar_url')
    .eq('company', me.company).eq('active', true).order('full_name');

  // Quem ficou de fora aparece explicitamente: sem isso o gestor so
  // descobre no meio do torneio que metade da loja nao esta competindo.
  const alocados = new Set((equipes || []).flatMap(e => e.membros || []));
  const semEquipe = (pessoas || []).filter(p => !alocados.has(p.id));

  const porId = Object.fromEntries((pessoas || []).map(p => [p.id, p]));
  res.json({
    equipes: (equipes || []).map(e => ({
      ...e,
      membros_detalhe: (e.membros || []).map(id => porId[id]).filter(Boolean),
    })),
    semEquipe,
  });
});

// POST /api/gamificacao/equipes  { requester_id, nome, membros }
router.post('/equipes', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuario nao encontrado' });
  if (!podeCriar(me)) return res.status(403).json({ error: 'So quem administra a loja monta equipes.' });

  const { nome, membros } = req.body || {};
  if (!nome?.trim()) return res.status(400).json({ error: 'De um nome a equipe.' });

  const limpos = await validarMembros(me.company, membros, null);
  if (limpos.erro) return res.status(400).json({ error: limpos.erro });

  const { data, error } = await supabase.from('equipes_torneio').insert({
    company: me.company, nome: nome.trim(), membros: limpos.ids, criado_por: me.id,
  }).select().single();
  if (error) return res.status(500).json({ error: 'Nao foi possivel criar a equipe.' });

  logAction({ company: me.company, user_id: me.id, acao: 'criar_equipe_torneio', tabela: 'equipes_torneio', depois: { id: data.id, nome: data.nome } });
  res.json(data);
});

// PUT /api/gamificacao/equipes/:id
router.put('/equipes/:id', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuario nao encontrado' });
  if (!podeCriar(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: atual } = await supabase
    .from('equipes_torneio').select('company').eq('id', req.params.id).maybeSingle();
  if (!atual || atual.company !== me.company) return res.status(404).json({ error: 'Equipe nao encontrada' });

  const { nome, membros } = req.body || {};
  if (!nome?.trim()) return res.status(400).json({ error: 'De um nome a equipe.' });

  const limpos = await validarMembros(me.company, membros, req.params.id);
  if (limpos.erro) return res.status(400).json({ error: limpos.erro });

  const { data, error } = await supabase.from('equipes_torneio')
    .update({ nome: nome.trim(), membros: limpos.ids })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Nao foi possivel salvar.' });

  logAction({ company: me.company, user_id: me.id, acao: 'editar_equipe_torneio', tabela: 'equipes_torneio', depois: { id: data.id, nome: data.nome } });
  res.json(data);
});

// DELETE /api/gamificacao/equipes/:id?requester_id=
router.delete('/equipes/:id', async (req, res) => {
  const quem = req.body?.requester_id || req.query?.requester_id;
  const me = await getPerfil(quem);
  if (!me) return res.status(403).json({ error: 'Usuario nao encontrado' });
  if (!podeCriar(me)) return res.status(403).json({ error: 'Acesso negado' });

  const { data: atual } = await supabase
    .from('equipes_torneio').select('company, nome').eq('id', req.params.id).maybeSingle();
  if (!atual || atual.company !== me.company) return res.status(404).json({ error: 'Equipe nao encontrada' });

  await supabase.from('equipes_torneio').delete().eq('id', req.params.id);
  logAction({ company: me.company, user_id: me.id, acao: 'excluir_equipe_torneio', tabela: 'equipes_torneio', antes: { nome: atual.nome } });
  res.json({ ok: true });
});

// Uma pessoa em UMA equipe so. Em duas, os pontos dela contariam duas vezes
// e o placar mentiria - e ninguem descobriria olhando a tela.
async function validarMembros(company, membros, ignorarEquipeId) {
  const ids = [...new Set((Array.isArray(membros) ? membros : []).filter(Boolean))];
  if (!ids.length) return { ids: [] };

  const { data: validos } = await supabase
    .from('profiles').select('id').eq('company', company).in('id', ids);
  const doEstabelecimento = new Set((validos || []).map(p => p.id));
  const forasteiro = ids.find(id => !doEstabelecimento.has(id));
  if (forasteiro) return { erro: 'So e possivel incluir pessoas desta loja.' };

  let consulta = supabase.from('equipes_torneio').select('id, nome, membros').eq('company', company);
  if (ignorarEquipeId) consulta = consulta.neq('id', ignorarEquipeId);
  const { data: outras } = await consulta;

  for (const e of outras || []) {
    const repetido = (e.membros || []).find(id => ids.includes(id));
    if (repetido) return { erro: `Alguem que voce escolheu ja esta na equipe "${e.nome}".` };
  }
  return { ids };
}

// GET /api/gamificacao/regras
//
// As regras saem do MESMO objeto que calcula o placar. Escrever a
// explicacao a mao criaria duas verdades: bastaria mexer num peso e a tela
// passaria a mentir sem ninguem perceber. Aqui, mudar a pontuacao muda a
// explicacao no mesmo instante.
//
// E os TETOS aparecem abertos de proposito. Esconder limite nao evita
// fraude - quem quer burlar descobre testando - e so prejudica quem esta
// jogando limpo e gastaria esforco a toa.
router.get('/regras', (_req, res) => {
  const porFamilia = {};
  FAMILIAS_VALIDAS.forEach(chave => {
    porFamilia[chave] = { chave, ...FAMILIAS[chave], acoes: [] };
  });

  Object.entries(ACOES).forEach(([chave, a]) => {
    porFamilia[a.familia].acoes.push({
      chave, nome: a.nome, base: a.base, tetoDia: a.tetoDia,
    });
  });

  Object.entries(QUALIDADE).forEach(([chave, q]) => {
    porFamilia.qualidade.acoes.push({
      chave, nome: q.nome, base: q.base, tetoDia: null,
    });
  });

  // Do mais valioso para o menos, dentro de cada familia.
  Object.values(porFamilia).forEach(f => f.acoes.sort((a, b) => b.base - a.base));

  res.json({
    pontosPorDiaAtivo: PONTOS_POR_DIA_ATIVO,
    familias: Object.values(porFamilia),
  });
});

// GET /api/gamificacao/familias — o catálogo, para a tela de criar torneio
router.get('/familias', (_req, res) => {
  res.json(FAMILIAS_VALIDAS.map(chave => ({ chave, ...FAMILIAS[chave] })));
});

// GET /api/gamificacao/contexto?requester_id= — o que esta pessoa pode criar
router.get('/contexto', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json({ podeCriar: false, escopoLoja: false, subordinados: [], pessoasLoja: [] });
  const { todos, subordinados } = await cadeiaDeSubordinados(me.company, me.id);
  const enxuto = p => ({ id: p.id, full_name: p.full_name, sector: p.sector, avatar_url: p.avatar_url });
  res.json({
    podeCriar: podeCriar(me) || subordinados.length > 0,
    escopoLoja: podeCriar(me),
    subordinados: subordinados.map(enxuto),
    pessoasLoja: todos.map(enxuto),
    frequencias: FREQUENCIAS, unidades: UNIDADES, tetoAtingimento: TETO_ATINGIMENTO,
  });
});

// GET /api/gamificacao/campanhas?requester_id=
router.get('/campanhas', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  if (!me.company) return res.json([]);

  const { data, error } = await supabase
    .from('campanhas_gamificacao').select('*')
    .eq('company', me.company).order('inicio', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao carregar as campanhas.' });

  // Nome de quem criou e dos apuradores: a tela mostra "apuração semanal
  // por Maria" — quem lança o resultado tem que estar claro para todos.
  const visiveis = (data || []).filter(c => podeVer(c, me));
  const ids = [...new Set(visiveis.flatMap(c => [c.criado_por, ...(c.apuradores || [])]).filter(Boolean))];
  const { data: pessoas } = ids.length
    ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
  const nome = Object.fromEntries((pessoas || []).map(p => [p.id, p.full_name]));
  res.json(visiveis.map(c => ({
    ...c,
    criador_nome: nome[c.criado_por] || null,
    apuradores_nomes: (c.apuradores || []).map(id => nome[id]).filter(Boolean),
    frequencia_texto: FREQUENCIAS[c.frequencia_apuracao] || null,
    souApurador: ehApurador(c, me),
    participo: c.escopo !== 'equipe' || (c.participantes || []).includes(me.id),
  })));
});

// POST /api/gamificacao/campanhas
router.post('/campanhas', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  // Admin cria para a loja; quem lidera pessoas cria para os subordinados.
  const { subordinados, todos } = await cadeiaDeSubordinados(me.company, me.id);
  const ehAdmin = podeCriar(me);
  if (!ehAdmin && !subordinados.length) {
    return res.status(403).json({ error: 'Só quem administra a loja ou lidera pessoas cria torneios.' });
  }

  const { nome, descricao, premio, premios, inicio, fim, metricas, tema, tipo, objetivos, apuradores, frequencia_apuracao, peso_objetivo } = req.body || {};
  if (!nome?.trim() || !inicio || !fim) {
    return res.status(400).json({ error: 'Nome, início e fim são obrigatórios.' });
  }
  if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser antes do início.' });

  const tipoFinal = TIPOS.includes(tipo) ? tipo : 'automatica';

  // Escopo: loja inteira só para admin; líder cria para a equipe dele, e só
  // pode incluir gente da própria cadeia. O líder não concorre no próprio
  // torneio — ele apura.
  const escopo = ehAdmin && req.body?.escopo !== 'equipe' ? 'loja' : 'equipe';
  let participantes = null;
  if (escopo === 'equipe') {
    const permitidos = new Set((ehAdmin ? todos : subordinados).map(p => p.id).filter(id => id !== me.id));
    participantes = [...new Set((Array.isArray(req.body?.participantes) ? req.body.participantes : []).filter(id => permitidos.has(id)))];
    if (!participantes.length) return res.status(400).json({ error: 'Escolha quem participa (pessoas da sua equipe).' });
  }

  // `metricas` guarda o PESO DE CADA FAMÍLIA. Peso limitado entre 1 e 5:
  // sem limite, um número absurdo faria uma família decidir o torneio
  // inteiro e as outras viravam enfeite.
  const pesos = (Array.isArray(metricas) ? metricas : [])
    .filter(m => FAMILIAS_VALIDAS.includes(m?.chave))
    .map(m => ({ chave: m.chave, peso: Math.min(Math.max(Number(m.peso) || 1, 1), 5) }));
  if (tipoFinal !== 'objetivo' && !pesos.length) return res.status(400).json({ error: 'Escolha pelo menos uma família de pontos.' });

  let objetivosFinal = [];
  if (tipoFinal !== 'automatica') {
    const v = validarObjetivos(objetivos);
    if (v.erro) return res.status(400).json({ error: v.erro });
    if (!v.objetivos.length) return res.status(400).json({ error: 'Defina pelo menos um objetivo.' });
    objetivosFinal = v.objetivos;
  }

  // Apuradores: qualquer pessoa da loja (a apuração pode ser delegada); o
  // criador sempre está. Tudo o que eles lançarem fica no log com nome.
  const daLoja = new Set(todos.map(p => p.id));
  const apuradoresFinal = [...new Set([me.id, ...(Array.isArray(apuradores) ? apuradores : []).filter(id => daLoja.has(id))])];

  const { data, error } = await supabase.from('campanhas_gamificacao').insert({
    company: me.company,
    nome: nome.trim(),
    descricao: descricao?.trim() || null,
    premio: premio?.trim() || null,
    escopo, participantes,
    tipo: tipoFinal,
    objetivos: objetivosFinal,
    apuradores: apuradoresFinal,
    frequencia_apuracao: tipoFinal === 'automatica' ? null : (FREQUENCIAS[frequencia_apuracao] ? frequencia_apuracao : 'final'),
    peso_objetivo: tipoFinal === 'mista' ? Math.min(90, Math.max(10, parseInt(peso_objetivo, 10) || 50)) : (tipoFinal === 'objetivo' ? 100 : 0),
    // Três colocações para cada disputa. Texto livre: prêmio é combinado da
    // loja (folga, vale, brinde), não valor que o sistema controla — o app
    // anuncia e registra, quem entrega é a loja.
    premios: {
      individual: (premios?.individual || []).slice(0, 3).map(t => String(t || '').trim().slice(0, 80)),
      equipes:    (premios?.equipes    || []).slice(0, 3).map(t => String(t || '').trim().slice(0, 80)),
    },
    inicio, fim,
    metricas: pesos,
    tema: TEMAS_VALIDOS.includes(tema) ? tema : 'classico',
    criado_por: me.id,
  }).select().single();

  if (error) {
    logError({ company: me.company, user_id: me.id, acao: 'criar_campanha', tabela: 'campanhas_gamificacao', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: error.message });
  }
  logAction({ company: me.company, user_id: me.id, acao: 'criar_campanha', tabela: 'campanhas_gamificacao', depois: { id: data.id, nome: data.nome, escopo, tipo: tipoFinal, participantes: participantes?.length ?? 'loja' } });
  res.json(data);
});

// PUT /api/gamificacao/campanhas/:id/encerrar
router.put('/campanhas/:id/encerrar', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: c } = await supabase
    .from('campanhas_gamificacao').select('company, criado_por').eq('id', req.params.id).maybeSingle();
  if (!c || c.company !== me.company) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (!podeCriar(me) && c.criado_por !== me.id) return res.status(403).json({ error: 'Só quem criou o torneio (ou o admin) encerra.' });

  await supabase.from('campanhas_gamificacao').update({ ativa: false }).eq('id', req.params.id);
  logAction({ company: me.company, user_id: me.id, acao: 'encerrar_campanha', tabela: 'campanhas_gamificacao', antes: { id: req.params.id } });
  res.json({ ok: true });
});

// GET /api/gamificacao/campanhas/:id/placar?requester_id=
router.get('/campanhas/:id/placar', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const { data: campanha } = await supabase
    .from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!campanha || campanha.company !== me.company) {
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }
  if (!podeVer(campanha, me)) return res.status(403).json({ error: 'Este torneio é de outra equipe.' });

  let consultaPessoas = supabase
    .from('profiles').select('id, full_name, sector, avatar_url')
    .eq('company', me.company).eq('active', true);
  if (campanha.escopo === 'equipe') consultaPessoas = consultaPessoas.in('id', campanha.participantes || []);
  const { data: pessoas } = await consultaPessoas;

  const ids = (pessoas || []).map(p => p.id);
  if (!ids.length) return res.json({ campanha, individual: [], setores: [], familias: [], objetivos: [] });

  const pesoDe = {};
  (campanha.metricas || []).forEach(m => { pesoDe[m.chave] = m.peso; });

  // Pontos por pessoa E por família: a tela mostra de onde veio cada ponto.
  // Placar que não se explica não muda comportamento — a pessoa precisa
  // saber o que fazer para subir.
  const pontos = {};
  const somar = (id, familia, valor) => {
    if (!pontos[id]) pontos[id] = {};
    pontos[id][familia] = (pontos[id][familia] || 0) + valor;
  };

  // ── Famílias vindas do registro de auditoria ──────────────────
  const soObjetivo = campanha.tipo === 'objetivo';
  const precisaLog = !soObjetivo && ['constancia', 'participacao'].some(f => pesoDe[f]);
  if (precisaLog) {
    const { data: registros } = await supabase
      .from('audit_logs')
      .select('user_id, acao, created_at')
      .eq('company', me.company).eq('status', 'sucesso')
      .in('user_id', ids)
      .in('acao', ACOES_DO_LOG)
      .gte('created_at', campanha.inicio).lte('created_at', fimDoDia(campanha.fim))
      .limit(50000);

    // Teto por dia: agrupa por pessoa + ação + dia ANTES de somar. É o que
    // impede alguém de criar 50 tarefas numa tarde e ganhar o torneio.
    const balde = {};
    const diasAtivos = {};
    (registros || []).forEach(r => {
      const dia = diaDe(r.created_at);
      const k = `${r.user_id}|${r.acao}|${dia}`;
      balde[k] = (balde[k] || 0) + 1;
      if (!diasAtivos[r.user_id]) diasAtivos[r.user_id] = new Set();
      diasAtivos[r.user_id].add(dia);
    });

    Object.entries(balde).forEach(([k, vezes]) => {
      const [userId, acao] = k.split('|');
      const regra = ACOES[acao];
      if (!regra) return;   // presença: marca o dia, não dá ponto
      const peso = pesoDe[regra.familia];
      if (!peso) return;
      somar(userId, regra.familia, Math.min(vezes, regra.tetoDia) * regra.base * peso);
    });

    if (pesoDe.constancia) {
      Object.entries(diasAtivos).forEach(([userId, dias]) => {
        somar(userId, 'constancia', dias.size * PONTOS_POR_DIA_ATIVO * pesoDe.constancia);
      });
    }
  }

  // ── Qualidade: as que medem prazo ─────────────────────────────
  if (!soObjetivo && pesoDe.qualidade) {
    for (const regra of Object.values(QUALIDADE)) {
      const contados = await regra.contar(ids, campanha.inicio, campanha.fim);
      Object.entries(contados).forEach(([id, qtd]) => {
        somar(id, 'qualidade', qtd * regra.base * pesoDe.qualidade);
      });
    }
  }

  const totalAuto = (id) => Object.values(pontos[id] || {}).reduce((s, v) => s + v, 0);

  // ── Objetivos: atingimento por pessoa, a partir dos lançamentos ─────
  // Pontos de objetivo vão de 0 a 120 (média ponderada dos atingimentos
  // × 100). Na campanha mista, os pontos automáticos são normalizados na
  // mesma escala (o melhor da campanha = 100) e os dois lados entram com o
  // peso escolhido pelo líder.
  const objetivosCfg = campanha.tipo === 'automatica' ? [] : (campanha.objetivos || []);
  const objPorPessoa = {};
  if (objetivosCfg.length) {
    const { data: lancamentos } = await supabase
      .from('resultados_torneio').select('objetivo_id, participante_id, valor, periodo_ref, created_at')
      .eq('campanha_id', campanha.id);
    const somaPesos = objetivosCfg.reduce((t, o) => t + o.peso, 0) || 1;
    ids.forEach(id => {
      const detalhe = objetivosCfg.map(o => {
        const meus = (lancamentos || []).filter(l => l.participante_id === id && l.objetivo_id === o.id);
        const valor = apurar(o, meus);
        const atingimento = atingimentoDe(o, valor);
        return { id: o.id, nome: o.nome, unidade: o.unidade, alvo: o.alvo, direcao: o.direcao, apuracao: o.apuracao, peso: o.peso, valor, atingimento, lancamentos: meus.length };
      });
      const score = detalhe.reduce((t, d) => t + (d.atingimento || 0) * d.peso, 0) / somaPesos * 100;
      objPorPessoa[id] = { detalhe, score: Math.round(score) };
    });
  }

  const pesoObj = campanha.tipo === 'objetivo' ? 100 : campanha.tipo === 'mista' ? (campanha.peso_objetivo || 50) : 0;
  const maxAuto = Math.max(1, ...ids.map(totalAuto));
  const totalDe = (id) => {
    if (campanha.tipo === 'automatica') return totalAuto(id);
    const obj = objPorPessoa[id]?.score || 0;
    if (campanha.tipo === 'objetivo') return obj;
    const autoNorm = totalAuto(id) / maxAuto * 100;
    return Math.round(autoNorm * (100 - pesoObj) / 100 + obj * pesoObj / 100);
  };

  const individual = (pessoas || [])
    .map(p => ({
      id: p.id, nome: p.full_name, setor: p.sector, avatar_url: p.avatar_url,
      pontos: totalDe(p.id),
      pontosAutomaticos: totalAuto(p.id),
      porFamilia: { ...(pontos[p.id] || {}), ...(objetivosCfg.length ? { objetivo: objPorPessoa[p.id]?.score || 0 } : {}) },
      objetivos: objPorPessoa[p.id]?.detalhe || [],
    }))
    .sort((a, b) => b.pontos - a.pontos);

  // Equipes montadas à mão têm prioridade. Se a loja ainda não montou
  // nenhuma, cai no setor — assim o torneio funciona desde o primeiro dia,
  // e as equipes entram quando o gestor tiver montado.
  // Equipes montadas valem para torneio da loja; o de equipe do líder
  // agrupa por setor dos participantes.
  const { data: equipesMontadas } = campanha.escopo === 'equipe'
    ? { data: [] }
    : await supabase.from('equipes_torneio').select('id, nome, membros').eq('company', me.company);

  const usandoEquipes = (equipesMontadas || []).length > 0;
  const pontoDe = Object.fromEntries(individual.map(p => [p.id, p.pontos]));

  let setores;
  if (usandoEquipes) {
    setores = (equipesMontadas || []).map(e => {
      const membros = (e.membros || []).filter(id => pontoDe[id] !== undefined);
      const soma = membros.reduce((t, id) => t + pontoDe[id], 0);
      return {
        setor: e.nome, pontos: soma, pessoas: membros.length,
        // Média por pessoa, não soma: com soma, equipe de 20 ganharia de
        // uma de 3 antes de começar.
        media: membros.length ? Math.round((soma / membros.length) * 10) / 10 : 0,
      };
    }).sort((a, b) => b.media - a.media);
  } else {
    const porSetor = {};
    individual.forEach(p => {
      const s = p.setor || 'Sem setor';
      if (!porSetor[s]) porSetor[s] = { setor: s, pontos: 0, pessoas: 0 };
      porSetor[s].pontos += p.pontos;
      porSetor[s].pessoas += 1;
    });
    setores = Object.values(porSetor)
      .map(s => ({ ...s, media: s.pessoas ? Math.round((s.pontos / s.pessoas) * 10) / 10 : 0 }))
      .sort((a, b) => b.media - a.media);
  }

  // Quem ficou fora de toda equipe continua no ranking individual, mas some
  // do de equipes. O número vai para a tela, para o gestor corrigir antes
  // de descobrir no meio do torneio.
  const alocados = new Set((equipesMontadas || []).flatMap(e => e.membros || []));
  const foraDeEquipe = usandoEquipes ? individual.filter(p => !alocados.has(p.id)).length : 0;

  const familias = soObjetivo ? [] : (campanha.metricas || [])
    .filter(m => FAMILIAS[m.chave])
    .map(m => ({ chave: m.chave, nome: FAMILIAS[m.chave].nome, peso: m.peso }));
  if (objetivosCfg.length) familias.push({ chave: 'objetivo', nome: 'Objetivos', peso: pesoObj, ehObjetivo: true });

  res.json({
    campanha: { ...campanha, frequencia_texto: FREQUENCIAS[campanha.frequencia_apuracao] || null },
    individual, setores, familias, usandoEquipes, foraDeEquipe,
    objetivos: objetivosCfg, souApurador: ehApurador(campanha, me), tetoAtingimento: TETO_ATINGIMENTO,
  });
});

// GET /api/gamificacao/campanhas/:id/extrato?requester_id=&user_id=
//
// O contraditorio do torneio. Alguem VAI dizer "eu fiz e nao contou" — e
// sem isto a conversa termina no "acho que sim", que e a pior forma de
// perder a confianca num placar.
//
// Mostra tudo o que a pessoa registrou no periodo: o que virou ponto, o que
// nao virou e a razao. Sem razao escrita, corte de limite parece o app
// engolindo ponto.
//
// Cada pessoa ve o proprio extrato; admin e master veem o de qualquer um —
// e e o gestor quem precisa dele para responder a reclamacao.
router.get('/campanhas/:id/extrato', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const alvoId = req.query.user_id || me.id;

  const { data: campanha } = await supabase
    .from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!campanha || campanha.company !== me.company) {
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }
  if (alvoId !== me.id && !ehApurador(campanha, me)) {
    return res.status(403).json({ error: 'Você só pode ver o seu próprio extrato.' });
  }

  const { data: pessoa } = await supabase
    .from('profiles').select('id, full_name, sector, company, active').eq('id', alvoId).maybeSingle();
  if (!pessoa || pessoa.company !== me.company) {
    return res.status(404).json({ error: 'Pessoa não encontrada' });
  }

  const pesoDe = {};
  (campanha.metricas || []).forEach(m => { pesoDe[m.chave] = m.peso; });

  const { data: registros } = await supabase
    .from('audit_logs').select('acao, created_at')
    .eq('company', me.company).eq('status', 'sucesso').eq('user_id', alvoId)
    .gte('created_at', campanha.inicio).lte('created_at', fimDoDia(campanha.fim))
    .limit(20000);

  // Agrupa por acao e por dia — é assim que o teto é aplicado, e mostrar do
  // mesmo jeito deixa a conta conferível linha a linha.
  const porAcaoDia = {};
  const diasAtivos = new Set();
  (registros || []).forEach(r => {
    const dia = diaDe(r.created_at);
    if (ACOES_PRESENCA.includes(r.acao)) { diasAtivos.add(dia); return; }   // marca o dia, não pontua
    if (!ACOES[r.acao]) return;   // ação registrada que não entra no jogo
    const k = `${r.acao}|${dia}`;
    porAcaoDia[k] = (porAcaoDia[k] || 0) + 1;
    diasAtivos.add(dia);
  });

  const resumo = {};
  Object.entries(porAcaoDia).forEach(([k, vezes]) => {
    const [acao] = k.split('|');
    const regra = ACOES[acao];
    if (!resumo[acao]) {
      resumo[acao] = {
        acao, nome: regra.nome, familia: regra.familia, base: regra.base,
        tetoDia: regra.tetoDia, vezes: 0, contadas: 0, cortadas: 0, dias: 0,
      };
    }
    const contadas = Math.min(vezes, regra.tetoDia);
    resumo[acao].vezes    += vezes;
    resumo[acao].contadas += contadas;
    resumo[acao].cortadas += vezes - contadas;
    resumo[acao].dias     += 1;
  });

  const linhas = Object.values(resumo).map(r => {
    const peso = pesoDe[r.familia] || 0;
    const pontos = peso ? r.contadas * r.base * peso : 0;
    let observacao = null;
    if (!peso) {
      observacao = `Não conta neste torneio: a família ${FAMILIAS[r.familia].nome} ficou de fora.`;
    } else if (r.cortadas > 0) {
      observacao = `${r.cortadas} não contaram: o limite é ${r.tetoDia} por dia.`;
    }
    return { ...r, peso, pontos, familiaNome: FAMILIAS[r.familia].nome, observacao };
  }).sort((a, b) => b.pontos - a.pontos || b.vezes - a.vezes);

  // Qualidade separada: aqui o motivo de não pontuar é o prazo, não o teto.
  const qualidade = [];
  if (pesoDe.qualidade) {
    for (const regra of Object.values(QUALIDADE)) {
      const contados = await regra.contar([alvoId], campanha.inicio, campanha.fim);
      const qtd = contados[alvoId] || 0;
      qualidade.push({
        nome: regra.nome, base: regra.base, qtd,
        pontos: qtd * regra.base * pesoDe.qualidade,
      });
    }
  }

  const pontosConstancia = pesoDe.constancia
    ? diasAtivos.size * PONTOS_POR_DIA_ATIVO * pesoDe.constancia : 0;

  const total = linhas.reduce((t, l) => t + l.pontos, 0)
              + qualidade.reduce((t, q) => t + q.pontos, 0)
              + pontosConstancia;

  res.json({
    pessoa: { id: pessoa.id, nome: pessoa.full_name, setor: pessoa.sector },
    periodo: { inicio: campanha.inicio, fim: campanha.fim },
    familiasAtivas: (campanha.metricas || []).map(m => ({ chave: m.chave, nome: FAMILIAS[m.chave]?.nome, peso: m.peso })),
    diasAtivos: diasAtivos.size,
    pontosPorDiaAtivo: PONTOS_POR_DIA_ATIVO,
    pontosConstancia,
    linhas, qualidade, total,
  });
});

// ─── Resultados dos objetivos ───────────────────────────────────────
//
// Quem lança é o apurador (criador, quem ele delegou, ou admin). Cada
// lançamento fica com quem lançou e quando — é o contraditório da
// campanha por objetivo, como o extrato é o da automática.

// GET /api/gamificacao/campanhas/:id/resultados?requester_id=
router.get('/campanhas/:id/resultados', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data: c } = await supabase.from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!c || c.company !== me.company || !podeVer(c, me)) return res.status(404).json({ error: 'Campanha não encontrada' });

  const { data } = await supabase.from('resultados_torneio')
    .select('id, objetivo_id, participante_id, valor, periodo_ref, observacao, created_at, lancado_por, participante:participante_id(full_name), lancador:lancado_por(full_name)')
    .eq('campanha_id', c.id).order('created_at', { ascending: false });
  res.json(data || []);
});

// POST /api/gamificacao/campanhas/:id/resultados
//   { requester_id, objetivo_id, participante_id, valor, periodo_ref, observacao }
router.post('/campanhas/:id/resultados', async (req, res) => {
  const me = await getPerfil(req.body?.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data: c } = await supabase.from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!c || c.company !== me.company) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (!ehApurador(c, me)) return res.status(403).json({ error: 'Só o apurador deste torneio lança resultados.' });
  if (!c.ativa) return res.status(400).json({ error: 'Torneio encerrado não recebe resultado.' });

  const { objetivo_id, participante_id, valor, periodo_ref, observacao } = req.body || {};
  const objetivo = (c.objetivos || []).find(o => o.id === objetivo_id);
  if (!objetivo) return res.status(400).json({ error: 'Objetivo não encontrado neste torneio.' });
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'Informe um valor válido (zero ou mais).' });

  // Participante tem que estar na campanha (equipe) ou na loja (loja).
  const { data: alvo } = await supabase.from('profiles').select('id, company, full_name').eq('id', participante_id).maybeSingle();
  if (!alvo || alvo.company !== c.company) return res.status(400).json({ error: 'Participante inválido.' });
  if (c.escopo === 'equipe' && !(c.participantes || []).includes(participante_id)) {
    return res.status(400).json({ error: 'Essa pessoa não participa deste torneio.' });
  }

  const { data, error } = await supabase.from('resultados_torneio').insert({
    campanha_id: c.id, objetivo_id, participante_id, valor: v,
    periodo_ref: /^\d{4}-\d{2}-\d{2}$/.test(periodo_ref || '') ? periodo_ref : null,
    observacao: String(observacao || '').trim().slice(0, 200) || null,
    lancado_por: me.id,
  }).select().single();
  if (error) {
    logError({ company: c.company, user_id: me.id, acao: 'lancar_resultado_torneio', tabela: 'resultados_torneio', rota: req.originalUrl, erro_mensagem: error.message });
    return res.status(500).json({ error: 'Não foi possível salvar o resultado.' });
  }
  logAction({ company: c.company, user_id: me.id, acao: 'lancar_resultado_torneio', tabela: 'resultados_torneio',
    depois: { campanha: c.nome, objetivo: objetivo.nome, participante: alvo.full_name, valor: v, periodo_ref: data.periodo_ref } });
  res.json(data);
});

// DELETE /api/gamificacao/campanhas/:id/resultados/:rid?requester_id=
router.delete('/campanhas/:id/resultados/:rid', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });
  const { data: c } = await supabase.from('campanhas_gamificacao').select('*').eq('id', req.params.id).maybeSingle();
  if (!c || c.company !== me.company) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (!ehApurador(c, me)) return res.status(403).json({ error: 'Só o apurador deste torneio apaga resultados.' });

  const { data: r } = await supabase.from('resultados_torneio').select('*').eq('id', req.params.rid).eq('campanha_id', c.id).maybeSingle();
  if (!r) return res.status(404).json({ error: 'Resultado não encontrado' });
  await supabase.from('resultados_torneio').delete().eq('id', r.id);
  logAction({ company: c.company, user_id: me.id, acao: 'apagar_resultado_torneio', tabela: 'resultados_torneio', antes: { campanha: c.nome, objetivo_id: r.objetivo_id, participante_id: r.participante_id, valor: r.valor } });
  res.json({ ok: true });
});

// ─── Nível: progresso permanente ────────────────────────────────────
//
// Mecânica DIFERENTE do torneio, não uma variação dele. Torneio tem fim e
// alguém perde; nível não acaba e ninguém perde. É o que segura quem nunca
// vai ganhar de ninguém — que é a maioria — e o que mantém sentido nos
// períodos sem campanha nenhuma rodando.
//
// PESO FIXO 1 em tudo, de propósito. Se o nível usasse os pesos de cada
// campanha, quem trabalhou num mês de "Operação peso 5" subiria mais rápido
// que quem fez o mesmo noutro mês — e o progresso pessoal deixaria de ser
// comparável ao longo do tempo, que é justamente o que ele deveria medir.
//
// Pontos de nível nunca zeram: campanha acaba, nível acumula.
const NIVEIS = [
  { chave: 'bronze',   nome: 'Bronze',   emblema: '🥉', minimo: 0,     cor: '#CD7F32' },
  { chave: 'prata',    nome: 'Prata',    emblema: '🥈', minimo: 500,   cor: '#B9C2CC' },
  { chave: 'ouro',     nome: 'Ouro',     emblema: '🥇', minimo: 1500,  cor: '#F5C518' },
  { chave: 'platina',  nome: 'Platina',  emblema: '💎', minimo: 4000,  cor: '#4FD1C5' },
  { chave: 'diamante', nome: 'Diamante', emblema: '👑', minimo: 10000, cor: '#8B5CF6' },
  { chave: 'lenda',    nome: 'Lenda',    emblema: '⭐', minimo: 25000, cor: '#E8681A' },
];

// A primeira subida precisa vir rápido, senão a pessoa nunca sente o
// mecanismo funcionando. As últimas precisam demorar, senão perdem valor.

// GET /api/gamificacao/nivel?requester_id=&user_id=
router.get('/nivel', async (req, res) => {
  const me = await getPerfil(req.query.requester_id);
  if (!me) return res.status(403).json({ error: 'Usuário não encontrado' });

  const alvoId = req.query.user_id || me.id;
  if (alvoId !== me.id && !podeCriar(me)) {
    return res.status(403).json({ error: 'Você só pode ver o seu próprio nível.' });
  }

  // Desde sempre. A data antiga existe só porque as consultas pedem um
  // início; não há corte de histórico.
  const DESDE = '2000-01-01';
  const ATE = new Date().toISOString().slice(0, 10);

  const { data: registros } = await supabase
    .from('audit_logs').select('acao, created_at')
    .eq('company', me.company).eq('status', 'sucesso').eq('user_id', alvoId)
    .in('acao', ACOES_DO_LOG)
    .limit(50000);

  // O mesmo teto por dia do torneio. Sem ele, o nível seria só contagem
  // bruta e subir viraria questão de uma tarde ocupada.
  const balde = {};
  const dias = new Set();
  (registros || []).forEach(r => {
    const dia = diaDe(r.created_at);
    balde[`${r.acao}|${dia}`] = (balde[`${r.acao}|${dia}`] || 0) + 1;
    dias.add(dia);
  });

  let pontos = 0;
  Object.entries(balde).forEach(([k, vezes]) => {
    const [acao] = k.split('|');
    const regra = ACOES[acao];
    if (regra) pontos += Math.min(vezes, regra.tetoDia) * regra.base;
  });
  pontos += dias.size * PONTOS_POR_DIA_ATIVO;

  for (const regra of Object.values(QUALIDADE)) {
    const contados = await regra.contar([alvoId], DESDE, ATE);
    pontos += (contados[alvoId] || 0) * regra.base;
  }

  const atual = [...NIVEIS].reverse().find(n => pontos >= n.minimo) || NIVEIS[0];
  const proximo = NIVEIS.find(n => n.minimo > pontos) || null;

  res.json({
    pontos,
    diasAtivos: dias.size,
    nivel: atual,
    proximo,
    faltam: proximo ? proximo.minimo - pontos : 0,
    // Progresso dentro da faixa atual, para a barra não começar sempre do
    // zero a cada nível novo.
    progresso: proximo
      ? Math.round(((pontos - atual.minimo) / (proximo.minimo - atual.minimo)) * 100)
      : 100,
    escada: NIVEIS,
  });
});

module.exports = router;
// Exposto para teste das regras de objetivo.
module.exports._regras = { apurar, atingimentoDo: atingimentoDe, validarObjetivos, ACOES, ACOES_PRESENCA, QUALIDADE, TETO_ATINGIMENTO };
