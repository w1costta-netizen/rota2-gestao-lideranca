// ─────────────────────────────────────────────────────────────
// Módulo do Plano de Ação — OS GANCHOS DAS TAREFAS.
//
// O código geral das Tarefas (routes/tarefas.js) serve TODAS as tarefas do
// app. Ele não sabe nada de plano: nos pontos em que uma tarefa do plano
// pede um cuidado diferente, ele chama uma destas funções. Assim a regra
// do plano fica toda aqui, e mexer na tarefa comum não a quebra.
// ─────────────────────────────────────────────────────────────
const supabase = require('../../supabase');
const { hojeBR } = require('../recorrencia');
const { ehRotina, ultimaDataDaRotina, FECHADAS, garantirTarefasDaEmpresa } = require('./rotina');

// É tarefa que nasceu de uma ação do plano?
const ehTarefaDoPlano = (task) => !!task?.pdca_context?.acao_id;

// Tarefa do plano nunca gera a próxima sozinha: cada data já existe por si.
const repeteSozinha = (task) => !ehTarefaDoPlano(task);

// DATA MARCADA NÃO SE CONCLUI ANTES DO DIA (22/10/2026): rotina e medição.
// A ação de uma vez só pode ser terminada antes do prazo. Devolve a
// mensagem de recusa, ou null quando pode concluir.
function recusaConclusaoAntesDoDia(task, status) {
  const comDataMarcada = task?.pdca_context?.rotina || task?.pdca_context?.medicao;
  if (status !== 'concluida' || !comDataMarcada || !task.due_date || task.due_date <= hojeBR()) return null;
  const [, m, d] = task.due_date.split('-');
  return `Esta tarefa é do dia ${d}/${m}. Ela só pode ser concluída no próprio dia.`;
}

// Ao mudar a situação de uma tarefa do plano, a ação acompanha.
// Medição: fecha quando todas as medições estiverem feitas.
// Rotina: fecha só na ÚLTIMA data do prazo, sem nada aberto ("Não
// realizada" conta como encerrada).
async function aoMudarSituacao(task, tarefaId, status) {
  if (status === undefined || !ehTarefaDoPlano(task)) return;
  const acaoId = task.pdca_context.acao_id;
  const { data: irmas } = await supabase.from('tarefas')
    .select('id, status').eq('pdca_context->>acao_id', acaoId);
  const todas = (irmas || []).map(t => (t.id === tarefaId ? { ...t, status } : t));
  const { data: acao } = await supabase.from('acoes_pdca')
    .select('recorrencia, dias_semana, inicio, prazo, datas_medicao').eq('id', acaoId).maybeSingle();
  const fechou = ehRotina(acao)
    ? status === 'concluida' && task.due_date >= ultimaDataDaRotina(acao) && todas.every(t => FECHADAS.includes(t.status))
    : todas.length > 0 && todas.every(t => t.status === 'concluida');
  await supabase.from('acoes_pdca').update({
    concluida: fechou,
    concluida_em: fechou ? new Date().toISOString() : null,
  }).eq('id', acaoId);
}

// Apagar a tarefa de uma rotina tira SÓ aquela data: ela fica guardada na
// ação para não ser recriada. As outras datas continuam.
async function aoApagarTarefa(task) {
  if (!ehTarefaDoPlano(task) || task.pdca_context.medicao || !task.due_date) return;
  const { data: acao } = await supabase.from('acoes_pdca').select('*').eq('id', task.pdca_context.acao_id).maybeSingle();
  if (!ehRotina(acao)) return;
  const puladas = [...new Set([...(acao.datas_puladas || []), task.due_date])].sort();
  await supabase.from('acoes_pdca').update({ datas_puladas: puladas }).eq('id', acao.id);
}

// Ao abrir a lista de Tarefas: rede de segurança da rotina, em segundo
// plano (a lista não espera).
function aoAbrirTarefas(company) {
  garantirTarefasDaEmpresa(company).catch(() => {});
}

module.exports = { ehTarefaDoPlano, repeteSozinha, recusaConclusaoAntesDoDia, aoMudarSituacao, aoApagarTarefa, aoAbrirTarefas };
