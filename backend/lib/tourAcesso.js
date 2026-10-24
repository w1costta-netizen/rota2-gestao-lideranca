// ─────────────────────────────────────────────────────────────
// TOUR 4x4 — PARA QUEM É, QUEM VÊ, QUEM RESOLVE (24/10/2026).
//
// Decisões do dono do produto, uma a uma:
//  • Ao criar, escolhe-se para quem é: "Só para mim", pessoas específicas
//    da liderança, ou "Toda a liderança" (o Tour é ferramenta da
//    liderança; colaborador não recebe).
//  • Admin e master veem tudo. Os demais veem o que criaram, o que foi
//    endereçado a eles e o dos seus subordinados no organograma.
//  • Rascunho só aparece para quem criou: o tour chega às pessoas quando é
//    finalizado (e é aí que vai a notificação).
//  • Só os envolvidos registram conclusão: quem criou e quem recebeu.
//  • O líder endereça para o próprio time (como nas Tarefas) e também para
//    quem está ACIMA dele. É o caso do gerente que pede um tour a um líder:
//    o líder manda para o gerente, e o gerente — que recebeu — acrescenta
//    as outras pessoas que precisam resolver os pontos.
//  • Tours anteriores a isto (para_tipo vazio) continuam como eram: todos
//    da empresa veem e resolvem. Não entram no cartão do painel.
// ─────────────────────────────────────────────────────────────
const { cadeiaDeSubordinados } = require('./equipe');

// Quem tem o Tour 4x4: a liderança. É quem pode receber um tour.
const LIDERANCA = ['admin', 'supervisor', 'lider', 'analista', 'auxiliar_adm'];
const VE_TUDO = ['admin', 'master'];
// Mesmo critério das Tarefas: gestor passa para qualquer pessoa.
const ENDERECA_QUALQUER = ['admin', 'supervisor', 'master'];

const TIPOS = ['eu', 'pessoas', 'todos'];

// O que se precisa saber de quem pede, montado uma vez por chamada.
async function contextoDe(me, meId) {
  const { todos, subordinados } = await cadeiaDeSubordinados(me.company, meId);
  // Para cima: quem eu respondo, quem esse responde, e assim por diante.
  const porId = new Map(todos.map(p => [p.id, p]));
  const superiores = new Set();
  let fronteira = [meId];
  while (fronteira.length) {
    const proximos = [];
    for (const id of fronteira) {
      for (const chefe of (porId.get(id)?.reports_to_list || [])) {
        if (chefe !== meId && !superiores.has(chefe)) { superiores.add(chefe); proximos.push(chefe); }
      }
    }
    fronteira = proximos;
  }
  return {
    me, meId, porId,
    subordinados: new Set(subordinados.map(p => p.id)),
    superiores,
    lideranca: todos.filter(p => LIDERANCA.includes(p.access_level)),
  };
}

const veTudo = (ctx) => VE_TUDO.includes(ctx.me.access_level);
const ehAntigo = (t) => !t.para_tipo;
const destinatarios = (t) => t.destinatarios || [];

function podeVer(t, ctx) {
  if (veTudo(ctx) || t.created_by === ctx.meId) return true;
  if (ehAntigo(t)) return true;
  if (t.status !== 'finalizado') return false;
  if (t.para_tipo === 'eu') return false;
  if (t.para_tipo === 'todos') return true;
  if (destinatarios(t).includes(ctx.meId)) return true;
  if (ctx.subordinados.has(t.created_by)) return true;
  return destinatarios(t).some(id => ctx.subordinados.has(id));
}

// Envolvido = registra conclusão dos pontos.
function envolvido(t, ctx) {
  if (ehAntigo(t) || t.created_by === ctx.meId) return true;
  if (t.para_tipo === 'todos') return LIDERANCA.includes(ctx.me.access_level);
  return t.para_tipo === 'pessoas' && destinatarios(t).includes(ctx.meId);
}

// Mexer na estrutura (fotos, descrições, finalizar, apagar).
const podeEditar = (t, ctx) => t.created_by === ctx.meId || veTudo(ctx);

function podeEnderecarPara(alvoId, ctx) {
  if (!alvoId || alvoId === ctx.meId) return false;
  if (!ctx.lideranca.some(p => p.id === alvoId)) return false;
  if (ENDERECA_QUALQUER.includes(ctx.me.access_level)) return true;
  return ctx.subordinados.has(alvoId) || ctx.superiores.has(alvoId);
}

const podeAdicionarPessoas = (t, ctx) =>
  t.para_tipo === 'pessoas' && (envolvido(t, ctx) || veTudo(ctx));

const pontosPendentes = (t) =>
  (t.fotos || []).filter(f => !(f.evidencia_url || f.evidencia_comentario)).length;

// "Para mim" no painel: tours NOVOS, finalizados, com ponto em aberto.
function paraMim(t, ctx) {
  if (ehAntigo(t) || t.status !== 'finalizado' || !pontosPendentes(t)) return false;
  if (t.para_tipo === 'eu') return t.created_by === ctx.meId;
  if (t.para_tipo === 'todos') return t.created_by !== ctx.meId && LIDERANCA.includes(ctx.me.access_level);
  return destinatarios(t).includes(ctx.meId);
}

// O que eu mandei para outros e ainda tem ponto em aberto.
const enviadoEmAberto = (t, ctx) =>
  !ehAntigo(t) && t.para_tipo !== 'eu' && t.created_by === ctx.meId
  && t.status === 'finalizado' && pontosPendentes(t) > 0;

function destinoTexto(t, ctx) {
  if (t.para_tipo === 'eu') return `Só para ${ctx.porId.get(t.created_by)?.full_name || 'quem criou'}`;
  if (t.para_tipo === 'todos') return 'Toda a liderança';
  if (t.para_tipo === 'pessoas') return destinatarios(t).map(id => ctx.porId.get(id)?.full_name || 'Pessoa removida').join(', ');
  return null;
}

// O tour como sai para a tela: com nomes e com o que EU posso fazer nele.
function vestir(t, ctx) {
  return {
    ...t,
    destino_texto: destinoTexto(t, ctx),
    destinatarios_info: destinatarios(t).map(id => ({ id, full_name: ctx.porId.get(id)?.full_name || 'Pessoa removida' })),
    para_mim: paraMim(t, ctx),
    enviado_em_aberto: enviadoEmAberto(t, ctx),
    pode: {
      editar: podeEditar(t, ctx),
      concluir: envolvido(t, ctx),
      adicionar_pessoas: podeAdicionarPessoas(t, ctx),
      remover_pessoas: t.para_tipo === 'pessoas' && podeEditar(t, ctx),
    },
  };
}

// Quem recebe a notificação quando o tour é finalizado.
function quemAvisar(t, ctx) {
  if (t.para_tipo === 'todos') return ctx.lideranca.map(p => p.id).filter(id => id !== t.created_by);
  if (t.para_tipo === 'pessoas') return destinatarios(t).filter(id => id !== t.created_by);
  return [];
}

module.exports = {
  LIDERANCA, TIPOS, contextoDe, podeVer, envolvido, podeEditar, podeEnderecarPara,
  podeAdicionarPessoas, pontosPendentes, paraMim, enviadoEmAberto, vestir, quemAvisar,
};
