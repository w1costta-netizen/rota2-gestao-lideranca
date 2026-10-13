// ─────────────────────────────────────────────────────────────
// As tarefas que nascem do Plano de Ação.
//
// REGRA: quem manda na rotina é o PLANO. Se a ação diz "toda segunda, de
// 01/10 a 30/11, responsável Fulana", a Fulana tem que ter a tarefa da
// próxima segunda até 30/11 — aconteça o que acontecer com a tarefa de
// hoje. Apagar uma tarefa tira aquela data; não encerra a ação. Para
// encerrar antes, conclui-se ou apaga-se a ação no plano.
// ─────────────────────────────────────────────────────────────
const supabase = require('../supabase');
const { nextDueDate, hojeBR, diaSeguinte, primeiraOcorrenciaDesde } = require('./recorrencia');

const QUADRANTE_LABEL = { P: 'P — Planejar', D: 'D — Fazer', C: 'C — Checar', A: 'A — Agir' };

// Os quadrantes estruturados guardam a ação como um texto com rótulos
// ("Onde:", "Como:", "Por quê:"...). Esse texto inteiro virava o TÍTULO da
// tarefa — um parágrafo de seis linhas onde devia haver um título. Aqui ele
// é partido: a primeira linha (o "o quê") vira o título; o resto desce para
// a descrição, cada rótulo na sua linha.
const ROTULOS_ACAO = /^(Onde|Como|Por quê|Quanto custa|Comunicação|Treinamento|Monitoramento|Resultado observado|Problema|Meta|Causa raiz \(5 Porquês\)):/;

function partirAcao(descricao) {
  let linhas = String(descricao || '').split('\n');
  // No C a primeira linha é a classificação (emoji + rótulo em maiúsculas):
  // é estado da verificação, não o nome do que precisa ser feito.
  if (linhas.length > 1 && /^(✅|⚠️|⏳)\s/.test(linhas[0].trim())) linhas = linhas.slice(1);
  if (!linhas.join('').trim()) return { titulo: 'Ação do plano', corpo: '' };

  const i = linhas.findIndex(l => ROTULOS_ACAO.test(l.trim()));
  const livre    = (i < 0 ? linhas : linhas.slice(0, i)).join('\n').trim();
  const rotulada = (i < 0 ? [] : linhas.slice(i)).join('\n').trim();

  // O título é a primeira linha do texto livre. Se a ação só tem partes
  // rotuladas, a primeira delas vira título — melhor que tarefa sem nome.
  const fonte  = (livre || rotulada).split('\n');
  const titulo = fonte[0].trim();
  const resto  = fonte.slice(1).join('\n').trim();
  return {
    // 120 é folgado para um título e curto o bastante para caber no cartão.
    titulo: titulo.length > 120 ? `${titulo.slice(0, 117)}...` : titulo,
    corpo: livre ? [resto, rotulada].filter(Boolean).join('\n') : resto,
  };
}

function descricaoDaTarefa(tituloPlano, detalhe, corpo) {
  const partes = [`Ação do Plano: ${tituloPlano}`];
  if (detalhe?.trim()) partes.push(`Sua parte: ${detalhe.trim()}`);
  if (corpo?.trim()) partes.push('', corpo.trim());
  return partes.join('\n');
}

// O vínculo que a tarefa carrega. Sempre remontado a partir da ação, nunca
// herdado de outra tarefa — herdar foi como o vínculo se perdeu antes.
function contextoDaAcao(acao, plano, prazo) {
  return {
    plano_id: acao.plano_id,
    plano_titulo: plano?.titulo,
    quadrante: acao.quadrante,
    quadrante_label: QUADRANTE_LABEL[acao.quadrante] || acao.quadrante,
    meta: plano?.meta,
    acao_id: acao.id,
    repetir_ate: prazo || null,
  };
}

// Ação que tem rotina a cumprir: repete, gera tarefa, tem quem faça e até
// quando, e ninguém a encerrou (nem a ação, nem o plano). A verificação do
// C com datas combinadas fica de fora: lá cada data já é uma tarefa, criada
// de uma vez, e apagar uma delas é decisão sobre aquela medição.
const ehRotinaViva = (acao, plano) =>
  acao && plano
  && acao.criar_tarefa !== false
  && !!acao.responsavel_id
  && !!acao.prazo
  && !acao.concluida
  && acao.recorrencia && acao.recorrencia !== 'nenhuma'
  && !(acao.datas_medicao || []).length
  && plano.status !== 'concluido';

// GARANTE QUE A AÇÃO TENHA A PRÓXIMA TAREFA.
//
// Não faz nada se já existe tarefa em aberto da ação — ela é a próxima.
// Senão, cria a primeira data da rotina a partir de hoje (ou depois de
// `depoisDe`, a data que acabou de ser apagada), pulando as datas já
// concluídas, e nunca depois do prazo da ação.
//
// Devolve { id, due_date } da tarefa criada, ou null.
async function garantirProximaTarefa(acaoOuId, { depoisDe, plano: planoDado } = {}) {
  let acao = acaoOuId;
  if (typeof acaoOuId === 'string') {
    const { data } = await supabase.from('acoes_pdca').select('*').eq('id', acaoOuId).maybeSingle();
    acao = data;
  }
  if (!acao) return null;
  let plano = planoDado;
  if (!plano) {
    const { data } = await supabase.from('planos_acao').select('*').eq('id', acao.plano_id).maybeSingle();
    plano = data;
  }
  if (!ehRotinaViva(acao, plano)) return null;

  const { data: daAcao } = await supabase.from('tarefas')
    .select('id, due_date, status, created_by')
    .eq('pdca_context->>acao_id', acao.id)
    .order('due_date', { ascending: false });
  if ((daAcao || []).some(t => t.status !== 'concluida')) return null;

  const hoje = hojeBR();
  // Apagou a de hoje ou uma futura: a próxima é a seguinte a ela. Apagou
  // uma atrasada: a próxima é a de hoje, se hoje for dia da rotina.
  const desde = depoisDe && depoisDe >= hoje ? diaSeguinte(depoisDe) : hoje;
  const ancora = acao.inicio || acao.prazo;
  const feitas = new Set((daAcao || []).map(t => t.due_date));

  let data = primeiraOcorrenciaDesde(ancora, acao.recorrencia, acao.dias_semana, desde);
  // Data que já foi feita não volta: a seguinte é a vez dela.
  for (let i = 0; data && feitas.has(data) && i < 400; i++) {
    data = nextDueDate(data, acao.recorrencia, acao.dias_semana);
  }
  if (!data || data > acao.prazo) return null;

  const partida = partirAcao(acao.descricao);
  const { data: nova, error } = await supabase.from('tarefas').insert({
    company: plano.company,
    title: partida.titulo,
    description: descricaoDaTarefa(plano.titulo, acao.detalhe, partida.corpo),
    assigned_to: acao.responsavel_id,
    // Quem passou a tarefa continua sendo quem passou — é para essa
    // pessoa que vão os avisos de conclusão e de pedido de prazo.
    created_by: daAcao?.[0]?.created_by || plano.criado_por,
    due_date: data,
    priority: 'normal',
    recorrencia: acao.recorrencia,
    dias_semana: acao.recorrencia === 'dias_semana' ? acao.dias_semana : null,
    tags: ['plano_acao'],
    pdca_context: contextoDaAcao(acao, plano, acao.prazo),
    status: 'pendente',
  }).select('id, due_date').single();
  // 23505 = outra requisição criou a mesma data no mesmo instante (o
  // índice único do banco segura). Não é erro: a tarefa existe.
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(error.message);
  }
  await supabase.from('acoes_pdca').update({ tarefa_id: nova.id }).eq('id', acao.id);
  return nova;
}

// A EMPRESA INTEIRA: toda ação viva que ficou sem tarefa ganha a dela.
//
// É a rede de segurança — pega o que nenhum caminho previu (tarefa
// apagada antes desta correção, falha de rede ao criar a próxima, ação
// reaberta). Roda quando alguém abre as Tarefas, no máximo a cada poucos
// minutos por empresa, e nunca duas vezes ao mesmo tempo.
const INTERVALO_MS = 5 * 60 * 1000;
const ultimaVez = new Map();
const emAndamento = new Map();

async function garantirTarefasDaEmpresa(company) {
  if (!company) return 0;
  if (emAndamento.has(company)) return emAndamento.get(company);
  if (Date.now() - (ultimaVez.get(company) || 0) < INTERVALO_MS) return 0;
  ultimaVez.set(company, Date.now());

  const trabalho = (async () => {
    const { data: planos } = await supabase.from('planos_acao')
      .select('*').eq('company', company).neq('status', 'concluido');
    if (!planos?.length) return 0;
    const porId = Object.fromEntries(planos.map(p => [p.id, p]));

    const { data: acoes } = await supabase.from('acoes_pdca')
      .select('*')
      .in('plano_id', planos.map(p => p.id))
      .eq('concluida', false)
      .neq('recorrencia', 'nenhuma')
      .not('responsavel_id', 'is', null)
      .gte('prazo', hojeBR());
    const vivas = (acoes || []).filter(a => ehRotinaViva(a, porId[a.plano_id]));
    if (!vivas.length) return 0;

    // Uma leitura só para saber quem já tem tarefa em aberto.
    const { data: abertas } = await supabase.from('tarefas')
      .select('pdca_context')
      .in('pdca_context->>acao_id', vivas.map(a => a.id))
      .neq('status', 'concluida');
    const comTarefa = new Set((abertas || []).map(t => t.pdca_context?.acao_id));

    let criadas = 0;
    for (const acao of vivas.filter(a => !comTarefa.has(a.id))) {
      try {
        if (await garantirProximaTarefa(acao, { plano: porId[acao.plano_id] })) criadas++;
      } catch (e) {
        console.error('[plano] não criou a próxima tarefa da ação', acao.id, e.message);
      }
    }
    return criadas;
  })();

  emAndamento.set(company, trabalho);
  try { return await trabalho; } finally { emAndamento.delete(company); }
}

module.exports = {
  QUADRANTE_LABEL, partirAcao, descricaoDaTarefa, contextoDaAcao,
  ehRotinaViva, garantirProximaTarefa, garantirTarefasDaEmpresa,
};
