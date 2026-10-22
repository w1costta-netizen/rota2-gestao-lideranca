// ─────────────────────────────────────────────────────────────
// Módulo do Plano de Ação — AS TAREFAS DE CADA AÇÃO.
//
// Ação de uma vez só, medição do C (uma tarefa por data escolhida) e quem
// pode gerir um plano. A rotina (uma tarefa por data da repetição) está
// em ./rotina.js. Tirado de routes/pdca.js em 22/10/2026, para a regra do
// plano não ficar misturada com as rotas.
// ─────────────────────────────────────────────────────────────
const supabase = require('../../supabase');
const { partirAcao, descricaoDaTarefa, contextoDaAcao } = require('./rotina');
const { perfilDe, lojaPermitida } = require('../lojaPermitida');

// QUEM GERE UM PLANO (22/10/2026): quem criou o plano, ou admin/master da
// empresa. Antes qualquer supervisor editava/apagava qualquer plano — e a
// edição de AÇÃO não conferia nada: qualquer pessoa, de qualquer empresa,
// alterava a ação de outra. Foi uma edição feita por outra pessoa que
// trocou o "dono" das medições da Alice e as tirou da lista do gestor.
async function podeGerirPlano(requesterId, plano) {
  if (!plano) return false;
  const me = await perfilDe(requesterId);
  if (!me) return false;
  if ((await lojaPermitida(me, plano.company)) !== plano.company) return false;
  return me.access_level === 'master' || me.access_level === 'admin' || plano.criado_por === requesterId;
}
const NEGADO_PLANO = 'Só quem criou o plano, ou o admin da empresa, pode alterar este plano.';

// Quem passou as tarefas desta ação continua sendo quem passou, mesmo que
// outra pessoa edite a ação depois. Antes, a tarefa recriada nascia no nome
// de quem editou — e sumia da lista de quem tinha delegado.
async function criadorDaAcao(acaoId, plano, reserva) {
  const { data } = await supabase.from('tarefas').select('created_by')
    .eq('pdca_context->>acao_id', acaoId).order('created_at', { ascending: true }).limit(1);
  return data?.[0]?.created_by || plano?.criado_por || reserva;
}

// As mesmas repetições que as Tarefas entendem — a tarefa da ação é uma
// tarefa comum, e quem repete é o motor de lá.
const RECORRENCIAS = ['nenhuma', 'diaria', 'dias_semana', 'semanal', 'quinzenal', 'mensal'];

// 0 = domingo ... 6 = sábado. Mesma numeração do JavaScript, para não
// precisar converter em lugar nenhum — converter dia da semana é fonte
// clássica de erro de um dia.
const limparDiasSemana = (ds) => {
  const limpos = [...new Set((Array.isArray(ds) ? ds : []).map(Number))]
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort();
  return limpos.length ? limpos : null;
};

// O que a pessoa lê na tarefa dela. O título é a ação (igual para o grupo);
// a parte individual entra aqui, que é onde ela trabalha.
// Datas de medição do C: uma tarefa por data, todas criadas de uma vez.
//
// Com repetição, só existia a PRIMEIRA tarefa — a seguinte nascia quando a
// pessoa concluía a anterior. Quem não concluía nunca via as próximas, e o
// gestor não tinha onde conferir o calendário da coleta.
function limparDatas(datas) {
  if (!Array.isArray(datas)) return [];
  const so = datas
    .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  // Teto de segurança: uma lista enorme viraria centenas de tarefas na mão
  // de uma pessoa só.
  return [...new Set(so)].slice(0, 60);
}

async function criarTarefasDeMedicao({ datas, acao, plano, responsavel_id, requester_id, detalhe, pdcaContext }) {
  const linhas = datas.map(data => ({
    company: plano?.company,
    title: partirAcao(acao.descricao).titulo,
    description: descricaoDaTarefa(plano?.titulo, detalhe, partirAcao(acao.descricao).corpo),
    assigned_to: responsavel_id,
    due_date: data,
    priority: 'normal',
    recorrencia: 'nenhuma',
    tags: ['plano_acao'],
    created_by: requester_id,
    pdca_context: pdcaContext,
    status: 'pendente',
  }));
  if (!linhas.length) return null;
  // O erro AQUI era engolido. Como as tarefas antigas já foram apagadas
  // logo antes, uma falha deixava a pessoa com zero tarefas e nenhuma
  // mensagem em lugar nenhum — o cartão continuava dizendo "0 de 6
  // medições" e ninguém tinha como saber que deu errado.
  const { data: criadas, error } = await supabase.from('tarefas').insert(linhas).select('id');
  if (error) {
    const e = new Error(`Não foi possível criar as tarefas de medição: ${error.message}`);
    e.medicao = true;
    throw e;
  }
  return (criadas || [])[0]?.id || null;
}

// Apaga as tarefas de medição desta ação que ainda estão pendentes. O que a
// pessoa já concluiu fica: é registro do que aconteceu.
async function limparTarefasDeMedicao(acaoId) {
  if (!acaoId) return;
  // Só as de medição: o filtro apagava QUALQUER tarefa pendente da ação,
  // inclusive uma tarefa comum criada segundos antes na mesma requisição.
  await supabase.from('tarefas').delete()
    .eq('pdca_context->>acao_id', acaoId)
    .eq('pdca_context->>medicao', 'true')
    .eq('status', 'pendente');
}

// PÕE A TAREFA DE UMA AÇÃO EM DIA — atualiza o que existe, adota a órfã,
// e cria se não houver nenhuma viva.
//
// Existia em dois lugares com regras diferentes: um para a ação editada e
// outro, mais pobre, para as outras pessoas do grupo (ele pulava quem não
// tivesse `tarefa_id` e nunca criava nada). Resultado real: salvar a ação
// arrumava a tarefa de uma líder e deixava a da outra no formato antigo,
// e uma terceira sem tarefa nenhuma. Agora é a mesma função para todos.
async function porTarefaEmDia({ acao, plano, descricao, detalhe, repete, dias, inicio, prazo, criarTarefa, requesterId }) {
  const contexto = contextoDaAcao(acao, plano, prazo);

  const { data: ligadas } = await supabase.from('tarefas')
    .select('id, due_date, status')
    .eq('pdca_context->>acao_id', acao.id)
    .neq('status', 'concluida');

  // A referência antiga alcança a tarefa que PERDEU o vínculo — a
  // recorrência não copiava o contexto até o conserto de 05/10. Ela é
  // adotada de volta em vez de virar uma segunda tarefa na tela.
  const vivas = [...(ligadas || [])];
  if (acao.tarefa_id && !vivas.some(t => t.id === acao.tarefa_id)) {
    const { data: solta } = await supabase.from('tarefas')
      .select('id, due_date, status').eq('id', acao.tarefa_id).maybeSingle();
    // Pode apontar para linha APAGADA ou para tarefa já concluída: nos dois
    // casos não existe tarefa viva, e é por isso que a criação abaixo não
    // pode se guiar por `tarefa_id`.
    if (solta && solta.status !== 'concluida') vivas.push(solta);
  }

  const partida = partirAcao(descricao);
  const base = {
    recorrencia: RECORRENCIAS.includes(repete) ? repete : 'nenhuma',
    dias_semana: dias,
    title: partida.titulo,
    description: descricaoDaTarefa(plano?.titulo, detalhe, partida.corpo),
    pdca_context: contexto,
  };
  const novaData = inicio || prazo;

  for (const t of vivas) {
    const patch = { ...base };
    // A data só muda na tarefa que a ação referencia. Empurrar todas as
    // ocorrências em aberto para a mesma data juntaria tudo no mesmo dia.
    if (t.id === acao.tarefa_id && novaData && t.due_date !== novaData) patch.due_date = novaData;
    await supabase.from('tarefas').update(patch).eq('id', t.id);
  }

  if (vivas.length || !criarTarefa || !acao.responsavel_id || !prazo) return null;

  const { data: nova } = await supabase.from('tarefas').insert({
    company: plano?.company,
    ...base,
    assigned_to: acao.responsavel_id,
    due_date: novaData,
    priority: 'normal',
    tags: ['plano_acao'],
    created_by: await criadorDaAcao(acao.id, plano, requesterId),
    status: 'pendente',
  }).select('id').single();
  if (nova) await supabase.from('acoes_pdca').update({ tarefa_id: nova.id }).eq('id', acao.id);
  return nova?.id || null;
}


module.exports = {
  RECORRENCIAS, limparDiasSemana, limparDatas,
  criarTarefasDeMedicao, limparTarefasDeMedicao, porTarefaEmDia,
  criadorDaAcao, podeGerirPlano, NEGADO_PLANO, perfilDe, lojaPermitida,
};
