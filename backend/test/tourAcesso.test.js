// ─────────────────────────────────────────────────────────────
// TESTES DAS REGRAS DO TOUR 4x4 (lib/tourAcesso.js).
// Rode com:  npm test   (na pasta backend)
//
// Organograma de teste:  Gerente (admin) ← Líder A ← Colab
//                                         ← Líder B
// Cada caso é uma decisão do usuário de 24/10/2026.
// ─────────────────────────────────────────────────────────────
const path = require('path');
const Module = require('module');
// O módulo importa ./equipe (que fala com o banco); aqui o contexto é
// montado à mão, então basta um substituto vazio.
const carregar = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === './equipe') return { cadeiaDeSubordinados: async () => ({ todos: [], subordinados: [] }) };
  return carregar.call(this, pedido, ...resto);
};
const T = require(path.join(__dirname, '..', 'lib', 'tourAcesso.js'));

let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : `  (veio ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const pessoas = {
  ger: { id: 'ger', full_name: 'Gerente', access_level: 'admin', reports_to_list: [] },
  sup: { id: 'sup', full_name: 'Supervisor', access_level: 'supervisor', reports_to_list: ['ger'] },
  la:  { id: 'la', full_name: 'Líder A', access_level: 'lider', reports_to_list: ['ger'] },
  lb:  { id: 'lb', full_name: 'Líder B', access_level: 'lider', reports_to_list: ['ger'] },
  la2: { id: 'la2', full_name: 'Líder sob A', access_level: 'lider', reports_to_list: ['la'] },
  col: { id: 'col', full_name: 'Colab', access_level: 'colaborador', reports_to_list: ['la'] },
};
const lideranca = Object.values(pessoas).filter(p => T.LIDERANCA.includes(p.access_level));
const ctx = {
  ger: { me: pessoas.ger, meId: 'ger', subordinados: new Set(['sup', 'la', 'lb', 'la2', 'col']), superiores: new Set() },
  la:  { me: pessoas.la, meId: 'la', subordinados: new Set(['la2', 'col']), superiores: new Set(['ger']) },
  lb:  { me: pessoas.lb, meId: 'lb', subordinados: new Set(), superiores: new Set(['ger']) },
  la2: { me: pessoas.la2, meId: 'la2', subordinados: new Set(), superiores: new Set(['la', 'ger']) },
  col: { me: pessoas.col, meId: 'col', subordinados: new Set(), superiores: new Set(['la', 'ger']) },
};
for (const c of Object.values(ctx)) { c.lideranca = lideranca; c.porId = new Map(Object.values(pessoas).map(p => [p.id, p])); }

const pendente = [{ evidencia_url: null, evidencia_comentario: null }];
const tour = (o) => ({ status: 'finalizado', fotos: pendente, destinatarios: [], ...o });

// ── QUEM VÊ ──
const doLa2ParaLa = tour({ created_by: 'la2', para_tipo: 'pessoas', destinatarios: ['la'] });
confere('quem recebeu vê', T.podeVer(doLa2ParaLa, ctx.la), true);
confere('o chefe de quem criou vê', T.podeVer(doLa2ParaLa, ctx.la), true);
confere('líder de outro time não vê', T.podeVer(doLa2ParaLa, ctx.lb), false);
confere('admin vê tudo', T.podeVer(doLa2ParaLa, ctx.ger), true);
const doLbParaLb2 = tour({ created_by: 'lb', para_tipo: 'pessoas', destinatarios: ['la2'] });
confere('líder vê o que foi mandado para um subordinado dele', T.podeVer(doLbParaLb2, ctx.la), true);
const soMeu = tour({ created_by: 'la2', para_tipo: 'eu' });
confere('"só para mim": o chefe não vê', T.podeVer(soMeu, ctx.la), false);
confere('"só para mim": quem criou vê', T.podeVer(soMeu, ctx.la2), true);
const rascunho = tour({ created_by: 'la', para_tipo: 'pessoas', destinatarios: ['lb'], status: 'rascunho' });
confere('rascunho não chega a quem recebe', T.podeVer(rascunho, ctx.lb), false);
confere('rascunho: quem criou vê', T.podeVer(rascunho, ctx.la), true);
const paraTodos = tour({ created_by: 'la', para_tipo: 'todos' });
confere('"toda a liderança": outro líder vê', T.podeVer(paraTodos, ctx.lb), true);
const antigo = tour({ created_by: 'la', para_tipo: null });
confere('tour antigo continua visível para todos', T.podeVer(antigo, ctx.lb), true);

// ── QUEM CONCLUI ──
confere('quem recebeu conclui', T.envolvido(doLa2ParaLa, ctx.la), true);
confere('quem criou conclui', T.envolvido(doLa2ParaLa, ctx.la2), true);
confere('admin que não está no tour NÃO conclui', T.envolvido(doLa2ParaLa, ctx.ger), false);
confere('chefe que só acompanha NÃO conclui', T.envolvido(doLbParaLb2, ctx.la), false);
confere('"toda a liderança": líder conclui', T.envolvido(paraTodos, ctx.lb), true);
confere('tour antigo: qualquer um conclui, como antes', T.envolvido(antigo, ctx.lb), true);

// ── PARA QUEM SE ENDEREÇA ──
confere('líder manda para o subordinado', T.podeEnderecarPara('la2', ctx.la), true);
confere('líder manda para o chefe (o gerente que pediu)', T.podeEnderecarPara('ger', ctx.la), true);
confere('líder NÃO manda para líder de outro time', T.podeEnderecarPara('lb', ctx.la), false);
confere('colaborador não recebe tour', T.podeEnderecarPara('col', ctx.ger), false);
confere('admin manda para qualquer um da liderança', T.podeEnderecarPara('lb', ctx.ger), true);

// ── O CASO DO GERENTE (item 4) ──
const doLaParaGer = tour({ created_by: 'la', para_tipo: 'pessoas', destinatarios: ['ger'] });
confere('gerente que recebeu pode acrescentar pessoas', T.podeAdicionarPessoas(doLaParaGer, ctx.ger), true);
confere('e pode acrescentar o líder B', T.podeEnderecarPara('lb', ctx.ger), true);
const comLb = { ...doLaParaGer, destinatarios: ['ger', 'lb'] };
confere('líder B acrescentado passa a ver', T.podeVer(comLb, ctx.lb), true);
confere('e a concluir', T.envolvido(comLb, ctx.lb), true);
confere('quem não está no tour não acrescenta', T.podeAdicionarPessoas(doLa2ParaLa, ctx.lb), false);

// ── O CARTÃO DO PAINEL ──
confere('painel: chegou para mim com ponto aberto', T.paraMim(doLa2ParaLa, ctx.la), true);
confere('painel: do subordinado NÃO conta para o chefe', T.paraMim(doLbParaLb2, ctx.la), false);
confere('painel: tour antigo não entra', T.paraMim(antigo, ctx.la), false);
confere('painel: tudo concluído não entra', T.paraMim({ ...doLa2ParaLa, fotos: [{ evidencia_comentario: 'ok' }] }, ctx.la), false);
confere('painel: rascunho não entra', T.paraMim({ ...doLa2ParaLa, status: 'rascunho' }, ctx.la), false);
confere('painel: "só para mim" com ponto aberto conta para mim', T.paraMim(soMeu, ctx.la2), true);
confere('painel: enviado por mim em aberto', T.enviadoEmAberto(doLa2ParaLa, ctx.la2), true);
confere('painel: o que a equipe enviou NÃO conta para o admin', T.enviadoEmAberto(doLa2ParaLa, ctx.ger), false);

// ── NOTIFICAÇÃO ──
confere('avisa quem recebeu, não quem criou', T.quemAvisar(doLa2ParaLa, ctx.la2), ['la']);
confere('"toda a liderança" avisa a liderança menos quem criou', T.quemAvisar(paraTodos, ctx.la).sort(), ['ger', 'la2', 'lb', 'sup']);
confere('"só para mim" não avisa ninguém', T.quemAvisar(soMeu, ctx.la2), []);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
process.exitCode = falhas ? 1 : 0;
