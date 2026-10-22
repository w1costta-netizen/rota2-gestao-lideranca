// ─────────────────────────────────────────────────────────────
// TESTES DO MÓDULO DO PLANO DE AÇÃO (lib/planoAcao/).
// Rode com:  npm test   (na pasta backend)
//
// Cada caso aqui veio de um problema real com líderes (Cleidson, Joseane,
// Neverlene, Maristela, Alice — out/2026). Banco falso em memória, "hoje"
// fixo numa terça (20/10/2026). Se um teste falhar, a regra do plano
// mudou: entenda por quê antes de publicar.
// ─────────────────────────────────────────────────────────────
const path = require('path');
const BACK = path.join(__dirname, '..');
const HOJE = '2026-10-20'; // terça

const db = { tarefas: [], acoes_pdca: [], planos_acao: [], tarefa_comentarios: [], profiles: [{ id: 'lider', full_name: 'Líder Teste' }] };
let seq = 0;
const campo = (r, k) => {
  if (k.includes('->>')) { const [a, b] = k.split('->>'); const v = r[a]?.[b]; return v === undefined || v === null ? null : String(v); }
  return r[k] === undefined ? null : r[k];
};
function q(tab) {
  const f = []; let op = 'select', payload, single = false, ordem, lim;
  const api = {
    select() { return api; },
    eq(k, v) { f.push(r => campo(r, k) === v); return api; },
    neq(k, v) { f.push(r => campo(r, k) !== null && campo(r, k) !== v); return api; },
    gt(k, v) { f.push(r => campo(r, k) > v); return api; },
    gte(k, v) { f.push(r => campo(r, k) >= v); return api; },
    lt(k, v) { f.push(r => campo(r, k) !== null && campo(r, k) < v); return api; },
    in(k, vs) { f.push(r => vs.includes(campo(r, k))); return api; },
    is(k, v) { f.push(r => campo(r, k) === v); return api; },
    not(k, opn, v) { if (opn === 'in') { const vs = v.replace(/[()]/g, '').split(','); f.push(r => !vs.includes(campo(r, k))); } else f.push(r => campo(r, k) !== null); return api; },
    or(expr) { const conds = expr.split(',').map(c => { const m = c.match(/^(.*)\.(neq|is)\.([^.]*)$/); const col = m[1], op = m[2], val = m[3]; return r => op === 'neq' ? (campo(r, col) !== null && campo(r, col) !== val) : campo(r, col) === null; }); f.push(r => conds.some(fn => fn(r))); return api; },
    order(k, { ascending }) { ordem = [k, ascending]; return api; },
    limit(n) { lim = n; return api; },
    insert(p) { op = 'insert'; payload = p; return api; },
    update(p) { op = 'update'; payload = p; return api; },
    delete() { op = 'delete'; return api; },
    single() { single = true; return api; }, maybeSingle() { single = true; return api; },
    then(ok, no) { return Promise.resolve(run()).then(ok, no); },
  };
  function run() {
    const t = db[tab];
    if (op === 'insert') {
      const linhas = Array.isArray(payload) ? payload : [payload];
      for (const l of linhas) if (tab === 'tarefas' && l.pdca_context?.acao_id && t.some(x => x.pdca_context?.acao_id === l.pdca_context.acao_id && x.due_date === l.due_date)) return { data: null, error: { code: '23505', message: 'dup' } };
      const novas = linhas.map(l => ({ id: 't' + (++seq), ...JSON.parse(JSON.stringify(l)) }));
      t.push(...novas); return { data: single ? novas[0] : novas, error: null };
    }
    let rows = t.filter(r => f.every(fn => fn(r)));
    if (op === 'update') { rows.forEach(r => Object.assign(r, JSON.parse(JSON.stringify(payload)))); return { data: rows, error: null }; }
    if (op === 'delete') { db[tab] = t.filter(r => !rows.includes(r)); return { data: null, error: null }; }
    if (ordem) rows = [...rows].sort((a, b) => (a[ordem[0]] < b[ordem[0]] ? -1 : 1) * (ordem[1] ? 1 : -1));
    if (lim) rows = rows.slice(0, lim);
    return { data: single ? (rows[0] || null) : rows, error: null };
  }
  return api;
}
require.cache[require.resolve(path.join(BACK, 'supabase.js'))] = { exports: { from: q } };
const recPath = require.resolve(path.join(BACK, 'lib/recorrencia.js'));
const rec = require(recPath);
require.cache[recPath].exports = { ...rec, hojeBR: () => HOJE };
const P = require(path.join(BACK, 'lib/planoAcao/rotina.js'));
const V = require(path.join(BACK, 'lib/planoAcao/vigia.js'));
const G = require(path.join(BACK, 'lib/planoAcao/ganchos.js'));

let falhas = 0;
const confere = (nome, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado); if (!ok) falhas++;
  console.log(ok ? 'OK   ' : 'FALHA', nome, ok ? '' : `\n      obtido   ${JSON.stringify(obtido)}\n      esperado ${JSON.stringify(esperado)}`);
};
const reset = () => {
  db.tarefas = []; db.acoes_pdca = []; db.tarefa_comentarios = [];
  db.planos_acao = [{ id: 'p1', company: 'loja', titulo: 'Slots', meta: 'm', status: 'andamento', criado_por: 'gerente' }];
};
const acao = (x = {}) => { const a = { id: 'a1', plano_id: 'p1', quadrante: 'D', descricao: 'Acompanhar slots\nOnde: depósito', responsavel_id: 'lider', inicio: '2026-09-28', prazo: '2026-10-31', recorrencia: 'dias_semana', dias_semana: [1, 2, 3], criar_tarefa: true, concluida: false, ...x }; db.acoes_pdca.push(a); return a; };
const tarefa = (x) => { const t = { id: 't' + (++seq), assigned_to: 'lider', created_by: 'gerente', status: 'pendente', recorrencia: 'nenhuma', pdca_context: { acao_id: 'a1', plano_id: 'p1' }, company: 'loja', ...x }; db.tarefas.push(t); return t; };
const datas = (st) => db.tarefas.filter(t => !st || st.includes(t.status)).map(t => t.due_date).sort();

(async () => {
  confere('datas seg-ter-qua de 28/09 a 31/10 a partir de hoje', P.datasDaRotina(acao(), HOJE, '2026-11-03'), ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27', '2026-10-28']);
  confere('última data da rotina (31/10 é sábado → 28/10)', P.ultimaDataDaRotina(db.acoes_pdca[0]), '2026-10-28');

  // 1. Caso real (Cleidson/Jaqueline): linha antiga que se repetia, parada hoje.
  reset(); acao(); tarefa({ due_date: '2026-10-07', status: 'concluida' }); tarefa({ due_date: HOJE, recorrencia: 'dias_semana', dias_semana: [1, 2, 3] });
  await P.sincronizarRotina('a1');
  confere('converte a linha antiga e cria as datas que faltam', datas(['pendente']), ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27', '2026-10-28']);
  confere('  nenhuma tarefa da ação repete sozinha', db.tarefas.every(t => t.recorrencia === 'nenhuma'), true);
  confere('  todas marcadas como rotina', db.tarefas.every(t => t.pdca_context.rotina === true), true);
  confere('  título curto + descrição com o plano', [db.tarefas[2].title, db.tarefas[2].description.split('\n')[0]], ['Acompanhar slots', 'Ação do Plano: Slots']);
  confere('  quem passou continua o gerente', db.tarefas.filter(t => t.status === 'pendente').every(t => t.created_by === 'gerente'), true);
  confere('  ação aponta para a de hoje', db.acoes_pdca[0].tarefa_id, db.tarefas.find(t => t.due_date === HOJE).id);
  const antes = db.tarefas.length; await P.sincronizarRotina('a1');
  confere('  rodar de novo não duplica', db.tarefas.length, antes);

  // 2. Data que passou sem ser feita → Não realizada.
  reset(); acao(); tarefa({ due_date: '2026-10-19', pdca_context: { acao_id: 'a1', rotina: true } });
  await P.sincronizarRotina('a1');
  confere('ontem pendente vira não realizada', db.tarefas.find(t => t.due_date === '2026-10-19').status, 'nao_realizada');

  // 3. Data apagada de propósito não volta.
  reset(); acao({ datas_puladas: ['2026-10-27'] });
  await P.sincronizarRotina('a1');
  confere('27/10 apagada não é recriada', datas(), ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-28']);

  // 4. Ação editada: passa a ser só quinta.
  reset(); acao(); await P.sincronizarRotina('a1');
  const com = db.tarefas.find(t => t.due_date === '2026-10-26'); db.tarefa_comentarios.push({ tarefa_id: com.id });
  Object.assign(db.acoes_pdca[0], { dias_semana: [4] });
  await P.sincronizarRotina('a1');
  confere('editar: saem as datas que não batem (fica a que tem comentário)', datas(), ['2026-10-22', '2026-10-26', '2026-10-29']);

  // 5. Troca de responsável leva as datas futuras junto.
  reset(); acao(); await P.sincronizarRotina('a1');
  Object.assign(db.acoes_pdca[0], { responsavel_id: 'outra' }); await P.sincronizarRotina('a1');
  confere('trocar responsável move as datas futuras', [...new Set(db.tarefas.map(t => t.assigned_to))], ['outra']);

  // 6. Concluir a ação no plano encerra: saem as datas depois de hoje.
  reset(); acao(); await P.sincronizarRotina('a1');
  await P.encerrarRotina('a1');
  confere('encerrar rotina deixa só a de hoje', datas(), ['2026-10-20']);

  // 7. Ação concluída não gera (até ser reaberta).
  reset(); acao({ concluida: true }); await P.sincronizarRotina('a1');
  confere('ação concluída não gera', datas(), []);
  db.acoes_pdca[0].concluida = false; await P.sincronizarRotina('a1');
  confere('reaberta gera a partir de hoje', datas(), ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27', '2026-10-28']);

  // 8. Diária: janela de 14 dias (não cria o mês inteiro).
  reset(); acao({ recorrencia: 'diaria', dias_semana: null, prazo: '2026-12-31' }); await P.sincronizarRotina('a1');
  confere('diária cria hoje + 14 dias', [datas().length, datas()[0], datas().slice(-1)[0]], [15, '2026-10-20', '2026-11-03']);

  // 9. Empresa: prazo vencido fecha a ação; medição e tarefa comum não mexem.
  reset();
  acao({ id: 'velha', prazo: '2026-10-15' });
  acao({ id: 'med', recorrencia: 'nenhuma', datas_medicao: ['2026-10-10'] });
  tarefa({ id: 'comum', due_date: '2026-10-10', pdca_context: null });
  tarefa({ id: 'medt', due_date: '2026-10-10', pdca_context: { acao_id: 'med', medicao: true } });
  await P.garantirTarefasDaEmpresa('loja', { forcar: true });
  confere('prazo vencido: ação fecha', db.acoes_pdca.find(a => a.id === 'velha').concluida, true);
  confere('tarefa comum atrasada continua pendente', db.tarefas.find(t => t.id === 'comum').status, 'pendente');
  confere('medição atrasada continua pendente', db.tarefas.find(t => t.id === 'medt').status, 'pendente');

  // 10. Domingo incluído (caso da Estênia: dom, seg, ter, qui, sex, sáb).
  reset(); acao({ dias_semana: [0, 1, 2, 4, 5, 6] });
  confere('dias da Estênia nesta semana', P.datasDaRotina(db.acoes_pdca[0], HOJE, '2026-10-26'), ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);

  // 11. Caso Maristela: ação "concluída" pelo círculo, com datas pela frente.
  reset(); acao({ concluida: true }); tarefa({ due_date: HOJE, status: 'concluida', pdca_context: { acao_id: 'a1', rotina: true } });
  await P.garantirTarefasDaEmpresa('loja', { forcar: true });
  confere('concluída por engano: reabre a ação', db.acoes_pdca[0].concluida, false);
  confere('  e recria as próximas datas', datas(['pendente']), ['2026-10-21', '2026-10-26', '2026-10-27', '2026-10-28']);
  // Concluída de verdade (última data feita hoje): não reabre.
  reset(); acao({ concluida: true, prazo: HOJE });
  await P.garantirTarefasDaEmpresa('loja', { forcar: true });
  confere('última data feita: continua concluída', db.acoes_pdca[0].concluida, true);

  // 12. Tudo em dia: a conferência não refaz nada (é o que tira a lentidão).
  reset(); acao(); await P.sincronizarRotina('a1');
  const sup = require.cache[require.resolve(path.join(BACK, 'supabase.js'))].exports;
  let chamadas = 0; const orig = sup.from;
  sup.from = (t) => { chamadas++; return orig(t); };
  await P.garantirTarefasDaEmpresa('loja', { forcar: true });
  sup.from = orig;
  confere('em dia: poucas idas ao banco (sem sincronizar)', chamadas <= 6, true);
  console.log('      idas ao banco:', chamadas);
  db.tarefas = db.tarefas.filter(t => t.due_date !== '2026-10-27');
  await P.garantirTarefasDaEmpresa('loja', { forcar: true });
  confere('faltou uma data: recria', datas(['pendente']).includes('2026-10-27'), true);

  // ── O VIGIA ─────────────────────────────────────────────
  reset(); acao(); await P.sincronizarRotina('a1');
  confere('vigia: tudo em dia, nenhum problema', (await V.vigiarEmpresa('loja')).length, 0);
  db.tarefas = db.tarefas.filter(t => t.due_date !== HOJE);
  confere('vigia: aponta rotina sem a tarefa de hoje', (await V.vigiarEmpresa('loja')).some(p => p.startsWith('Rotina sem a tarefa de hoje')), true);
  reset(); acao({ concluida: true });
  confere('vigia: aponta rotina concluída com datas pela frente', (await V.vigiarEmpresa('loja')).some(p => p.startsWith('Rotina concluída com datas')), true);
  reset(); acao({ id: 'm1', recorrencia: 'nenhuma', datas_medicao: ['2026-10-22', '2026-10-29'] });
  tarefa({ due_date: '2026-10-22', pdca_context: { acao_id: 'm1', medicao: true } });
  confere('vigia: aponta medição sem tarefa', (await V.vigiarEmpresa('loja')).some(p => p.includes('Medição de 29/10 sem tarefa')), true);
  reset(); acao(); tarefa({ due_date: '2026-10-21', status: 'concluida', concluida_em: '2026-10-20T15:13:00Z', pdca_context: { acao_id: 'a1', rotina: true } });
  confere('vigia: aponta tarefa concluída antes do dia', (await V.vigiarEmpresa('loja')).some(p => p.startsWith('Concluída antes do dia')), true);

  // ── OS GANCHOS (o que o código geral das Tarefas chama) ──
  confere('gancho: rotina de amanhã não conclui', !!G.recusaConclusaoAntesDoDia({ due_date: '2026-10-21', pdca_context: { acao_id: 'a', rotina: true } }, 'concluida'), true);
  confere('gancho: medição de amanhã não conclui', !!G.recusaConclusaoAntesDoDia({ due_date: '2026-10-21', pdca_context: { acao_id: 'a', medicao: true } }, 'concluida'), true);
  confere('gancho: rotina de hoje conclui', G.recusaConclusaoAntesDoDia({ due_date: HOJE, pdca_context: { acao_id: 'a', rotina: true } }, 'concluida'), null);
  confere('gancho: ação de uma vez pode adiantar', G.recusaConclusaoAntesDoDia({ due_date: '2026-10-30', pdca_context: { acao_id: 'a' } }, 'concluida'), null);
  confere('gancho: tarefa comum pode adiantar', G.recusaConclusaoAntesDoDia({ due_date: '2026-10-30' }, 'concluida'), null);
  confere('gancho: tarefa do plano não repete sozinha', G.repeteSozinha({ pdca_context: { acao_id: 'a' } }), false);
  confere('gancho: tarefa comum repete', G.repeteSozinha({}), true);
  reset(); acao(); await P.sincronizarRotina('a1');
  const t27 = db.tarefas.find(t => t.due_date === '2026-10-27');
  db.tarefas = db.tarefas.filter(t => t !== t27);
  await G.aoApagarTarefa(t27);
  confere('gancho: apagar data da rotina guarda a data pulada', db.acoes_pdca[0].datas_puladas, ['2026-10-27']);
  await P.sincronizarRotina('a1');
  confere('gancho: data apagada não volta', datas().includes('2026-10-27'), false);
  reset(); acao(); await P.sincronizarRotina('a1');
  const hojeT = db.tarefas.find(t => t.due_date === HOJE);
  await G.aoMudarSituacao(hojeT, hojeT.id, 'concluida');
  confere('gancho: concluir a de hoje NÃO fecha a rotina', db.acoes_pdca[0].concluida, false);

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})();
