// ─────────────────────────────────────────────────────────────
// TESTES DO ASSISTENTE DO PLANO DE AÇÃO (lib/assistentePlano.js).
// Rode com:  npm test   (na pasta backend)
// Não chama a IA: confere o que vai para ela e o que volta para a tela.
// ─────────────────────────────────────────────────────────────
const path = require('path');
const A = require(path.join(__dirname, '..', 'lib', 'assistentePlano.js'));

let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : `  (veio ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const plano = { titulo: 'Reduzir ruptura', problema: 'Ruptura em 12% nas bebidas', meta: '', prazo_final: '2026-12-01' };
const acoes = [
  { id: 'p1', quadrante: 'P', descricao: 'Problema: ruptura\nCausa raiz (5 Porquês):\n1) reposição só de manhã' },
  { id: 'd1', grupo_id: 'g', quadrante: 'D', descricao: 'Repor à tarde', responsavel_id: 'u-joao', prazo: null },
  { id: 'd2', grupo_id: 'g', quadrante: 'D', descricao: 'Repor à tarde', responsavel_id: 'u-maria', prazo: null },
  { id: 'c1', quadrante: 'C', descricao: 'Medir ruptura', responsavel_id: null, prazo: '2026-11-10', datas_medicao: [] },
];
const doc = A.descreverPlano(plano, acoes);

// ── O QUE VAI PARA A IA ──
confere('nome de pessoa não vai (só "tem responsável")', /u-joao|u-maria/.test(doc), false);
confere('diz quando a ação tem responsável', doc.includes('tem responsável'), true);
confere('ação de várias pessoas conta uma vez', doc.split('Repor à tarde').length - 1, 1);
confere('aponta ação sem prazo', doc.includes('SEM prazo'), true);
confere('aponta C sem data de medição', doc.includes('sem data de medição'), true);
confere('quadrante vazio aparece como vazio', doc.includes('A — Agir: nenhuma ação ainda'), true);
const comRascunho = A.descreverPlano(plano, [], { problema: 'Fila no caixa', porques: ['falta operador', ''] });
confere('rascunho não salvo entra no pedido', comRascunho.includes('Fila no caixa') && comRascunho.includes('1) falta operador'), true);
const pedido = A.montarPedido('porques', plano, acoes);
confere('o plano vai cercado como dado, não instrução', pedido.mensagem.startsWith('<plano>') && pedido.mensagem.endsWith('</plano>'), true);
confere('cada modo tem seu formato de resposta', A.MODOS.every(m => A.montarPedido(m, plano, acoes).schema?.type === 'object'), true);

// ── QUANDO O BOTÃO FAZ SENTIDO ──
const vazio = { titulo: 'X' };
confere('porquês sem problema: pede o problema', !!A.faltaParaUsar('porques', vazio, [], {}), true);
confere('porquês com problema no rascunho: pode', A.faltaParaUsar('porques', vazio, [], { problema: 'Fila' }), null);
confere('ações sem P nem problema: pede o P', !!A.faltaParaUsar('acoes', vazio, [], {}), true);
confere('ações com P preenchido: pode', A.faltaParaUsar('acoes', vazio, [acoes[0]], {}), null);
confere('revisar plano vazio: pede para começar', !!A.faltaParaUsar('revisar', vazio, [], {}), true);

// ── O QUE VOLTA PARA A TELA ──
const p = A.arrumarResposta('porques', { porques: ['a', ' ', 'b', 'c', 'd', 'e', 'f'], meta_smart: ' 5% ', observacao: '' });
confere('no máximo 5 porquês, sem vazios', p.porques, ['a', 'b', 'c', 'd', 'e']);
confere('meta aparada', p.meta_smart, '5%');
const ac = A.arrumarResposta('acoes', { acoes: [{ oque: 'Repor', recorrencia: 'hora_em_hora' }, { oque: '' }] });
confere('repetição desconhecida vira "nenhuma"', ac.acoes[0].recorrencia, 'nenhuma');
confere('ação sem "o quê" é descartada', ac.acoes.length, 1);
const rv = A.arrumarResposta('revisar', { resumo: 'ok', pontos: [{ tipo: 'qualquer', texto: 'falta prazo' }] });
confere('tipo desconhecido vira "atenção"', rv.pontos[0].tipo, 'atencao');
confere('resposta quebrada não derruba a tela', A.arrumarResposta('acoes', null), { acoes: [] });

// ── LIMITE POR DIA ──
const dia = new Date('2026-10-24T12:00:00-03:00');
let liberados = 0;
for (let i = 0; i < A.USOS_POR_DIA + 3; i++) if (A.podeUsar('teste', dia)) liberados++;
confere(`para em ${A.USOS_POR_DIA} usos no dia`, liberados, A.USOS_POR_DIA);
A.devolverUso('teste');
confere('erro da IA devolve o uso', A.podeUsar('teste', dia), true);
confere('no dia seguinte zera', A.podeUsar('teste', new Date('2026-10-25T12:00:00-03:00')), true);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
process.exitCode = falhas ? 1 : 0;
