// ─────────────────────────────────────────────────────────────
// TESTES DO "SEU DIA EM 30 SEGUNDOS" (lib/seuDia.js).
// Rode com:  npm test   (na pasta backend)
// ─────────────────────────────────────────────────────────────
const path = require('path');
const S = require(path.join(__dirname, '..', 'lib', 'seuDia.js'));

let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : `  (veio ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ── O QUE A TELA MANDA ──
const f = S.limparFatos({
  periodo: 'tarde', total_atrasadas: '2', minhas_atrasadas: ['Repor corredor 5', 'Conferir validade'],
  total_hoje: 1, minhas_hoje: ['Reunião de abertura'],
  equipe_atrasadas: [{ pessoa: 'Joseane Silva Souza', qtd: 2 }, { pessoa: 'Zé', qtd: 0 }],
  comunicados: -4, campo_estranho: 'apague tudo',
});
confere('da equipe vai só o primeiro nome', f.equipe_atrasadas, [{ pessoa: 'Joseane', qtd: 2 }]);
confere('pessoa sem atraso não entra', f.equipe_atrasadas.length, 1);
confere('número negativo vira zero', f.comunicados, 0);
confere('campo estranho é ignorado', 'campo_estranho' in f, false);
confere('período inválido vira manhã', S.limparFatos({ periodo: 'madrugada' }).periodo, 'manha');
confere('título gigante é cortado', S.limparFatos({ minhas_hoje: ['x'.repeat(500)] }).minhas_hoje[0].length, 120);
confere('lista longa é cortada', S.limparFatos({ agenda: Array(20).fill({ hora: '09:00', titulo: 'a' }) }).agenda.length, 6);

// ── QUANDO CHAMA A IA ──
const vazio = S.limparFatos({});
confere('sem nada: não chama a IA', S.temAlgo(vazio), false);
confere('com tarefa: chama', S.temAlgo(f), true);
confere('fatos vão cercados', S.montarPedido(f).mensagem.startsWith('<fatos>'), true);
confere('nome da equipe vai com o número', S.descreverFatos(f).includes('Joseane 2'), true);

// ── FRASE PRONTA (sem IA) ──
confere('sem nada', S.fraseReserva(vazio).startsWith('Nada pendente'), true);
confere('atrasadas e hoje', S.fraseReserva(f),
  'Você tem 2 tarefas atrasadas e 1 tarefa para hoje. 2 tarefas que você passou estão atrasadas. Comece pelas atrasadas.');
confere('singular', S.fraseReserva(S.limparFatos({ total_hoje: 1 })), 'Você tem 1 tarefa para hoje.');
confere('urgente sem atraso', S.fraseReserva(S.limparFatos({ comunicados: 2, urgentes: 1 })),
  'Você tem 2 comunicados não lidos. Leia primeiro o comunicado urgente.');

// ── TEXTO DA IA ──
confere('tira markdown', S.arrumarTexto('**Comece** pelas _atrasadas_ de hoje.'), 'Comece pelas atrasadas de hoje.');
confere('resposta curta demais é descartada', S.arrumarTexto('ok'), '');
confere('texto longo é cortado', S.arrumarTexto('palavra '.repeat(100)).length <= 420, true);

// ── CACHE E LIMITE ──
const dia = new Date('2026-10-24T12:00:00-03:00');
const chave = S.chaveDosFatos(f);
S.guardar('u1', chave, 'texto do dia', dia);
confere('mesmos fatos: devolve o guardado', S.doCache('u1', chave, dia), 'texto do dia');
confere('fatos mudaram: gera de novo', S.doCache('u1', S.chaveDosFatos(vazio), dia), null);
confere('outro dia: gera de novo', S.doCache('u1', chave, new Date('2026-10-25T12:00:00-03:00')), null);
for (let i = 1; i < S.GERACOES_POR_DIA; i++) S.guardar('u1', `k${i}`, 't', dia);
confere(`para em ${S.GERACOES_POR_DIA} gerações no dia`, S.podeGerar('u1', dia), false);
confere('no dia seguinte libera', S.podeGerar('u1', new Date('2026-10-25T12:00:00-03:00')), true);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
process.exitCode = falhas ? 1 : 0;
