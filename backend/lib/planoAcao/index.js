// ─────────────────────────────────────────────────────────────
// MÓDULO DO PLANO DE AÇÃO — a única porta de entrada.
//
// Tudo o que diz respeito às tarefas que nascem de um plano de ação mora
// nesta pasta (pedido do usuário, 22/10/2026: "isolado no código para não
// se misturar com outros códigos do APP"):
//   rotina.js  — rotina = uma tarefa por data; virada do dia; janela de 14 dias
//   acoes.js   — ação de uma vez, medição do C, quem gere o plano
//   ganchos.js — o que o código geral das Tarefas chama
//   vigia.js   — a conferência diária que avisa o master
// Fora daqui, ninguém escreve regra de plano: importa deste arquivo.
// Os testes estão em backend/test/planoAcao.test.js (npm test).
// ─────────────────────────────────────────────────────────────
module.exports = {
  ...require('./rotina'),
  ...require('./acoes'),
  ...require('./ganchos'),
  ...require('./vigia'),
};
