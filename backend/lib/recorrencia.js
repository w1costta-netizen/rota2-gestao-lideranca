// ─────────────────────────────────────────────────────────────
// As datas de uma tarefa que se repete. Usado pelas Tarefas (concluir
// cria a próxima) e pelo Plano de Ação (a ação nunca fica sem a próxima).
// Uma conta só para os dois: duas versões da mesma regra foi exatamente o
// que fez a lista mostrar a quinzenal num dia e o servidor criá-la noutro.
// ─────────────────────────────────────────────────────────────

function nextDueDate(due_date, recorrencia, dias_semana) {
  if (!due_date || !recorrencia || recorrencia === 'nenhuma') return null;
  const d = new Date(due_date + 'T12:00:00');
  // Dias escolhidos ("de segunda a quarta"): anda de um em um até cair num
  // dia marcado. No máximo sete passos — se nenhum bater, a lista está
  // vazia e a tarefa simplesmente não se repete, em vez de girar sem fim.
  if (recorrencia === 'dias_semana') {
    const dias = (dias_semana || []).map(Number).filter(n => n >= 0 && n <= 6);
    if (!dias.length) return null;
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1);
      if (dias.includes(d.getDay())) return d.toISOString().split('T')[0];
    }
    return null;
  }
  if (recorrencia === 'diaria')     d.setDate(d.getDate() + 1);
  if (recorrencia === 'semanal')    d.setDate(d.getDate() + 7);
  // 15, não 14 — decisão do usuário (09/10/2026). O frontend decide em que
  // dia a rotina APARECE com a mesma conta (`caiNoDia`, em
  // frontend/src/lib/recorrencia.js). Se mudar aqui, muda lá.
  if (recorrencia === 'quinzenal')  d.setDate(d.getDate() + 15);
  if (recorrencia === 'mensal')     d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// Hoje no relógio da loja, não do servidor (que roda em UTC: das 21h em
// diante ele já está "amanhã").
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const diaSeguinte = (ymd) => {
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

// A PRIMEIRA OCORRÊNCIA EM `desde` OU DEPOIS.
//
// Anda de passo em passo a partir da âncora (a primeira data da rotina),
// em vez de calcular a partir de `desde`, para não perder o ritmo: uma
// rotina "toda segunda" tem que continuar caindo na segunda, e uma
// quinzenal no mesmo ciclo de 15 dias em que começou.
function primeiraOcorrenciaDesde(ancora, recorrencia, dias_semana, desde) {
  if (!ancora) return null;
  let d = ancora;
  // Teto de segurança: ~3 anos de rotina diária. Nunca deveria chegar
  // perto, mas um laço sem teto num servidor não é risco que se corre.
  for (let i = 0; d && d < desde && i < 1100; i++) {
    d = nextDueDate(d, recorrencia, dias_semana);
  }
  return d && d >= desde ? d : null;
}

// A PRÓXIMA OCORRÊNCIA QUE AINDA NÃO PASSOU.
//
// `nextDueDate` anda um passo a partir da data guardada. Concluir uma
// rotina atrasada criava a próxima AINDA NO PASSADO, e ela voltava para
// "Atrasadas" na hora. Uma rotina de segunda a quarta parada em 29/09,
// concluída numa sexta, virava 30/09, depois 01/10, depois 06/10... A
// pessoa clicava, a tarefa voltava, e parecia que o app não salvava.
//
// Quem conclui atrasado está fazendo a rotina AGORA — não seis vezes. A
// conclusão vale pela de hoje, e a próxima é a primeira DEPOIS de hoje.
// Concluir adiantado (data no futuro) não muda nada: o primeiro passo já
// cai depois de hoje.
function proximaOcorrenciaFutura(due_date, recorrencia, dias_semana) {
  const primeiroPasso = nextDueDate(due_date, recorrencia, dias_semana);
  return primeiraOcorrenciaDesde(primeiroPasso, recorrencia, dias_semana, diaSeguinte(hojeBR()));
}

module.exports = { nextDueDate, hojeBR, diaSeguinte, primeiraOcorrenciaDesde, proximaOcorrenciaFutura };
