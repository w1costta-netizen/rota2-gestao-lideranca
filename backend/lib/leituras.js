const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// "Já vi isto": quando a pessoa viu cada item pela última vez.
//
// Serve a duas perguntas que a tela faz o tempo todo:
//  • este relato do diário é novo para mim?
//  • tem comentário aqui que eu ainda não li?
//
// Nunca derruba a rota que a chama: se a tabela falhar, a lista continua
// aparecendo — sem marcação de novo, que é bem menos grave do que a tela
// não abrir.
// ─────────────────────────────────────────────────────────────

const TIPOS = ['diario', 'mural', 'comunicado', 'tarefa'];

// Dia em que o aviso de "não lido" entrou no ar.
//
// Sem este corte, a estreia acusaria meses de histórico como novidade e a
// loja inteira pararia para ler o passado — trabalho que não muda nada.
// Tudo que é anterior a esta data nasce lido, para todo mundo.
const ESTREIA = '2026-09-22T00:00:00.000Z';

// A partir de quando vale avisar esta pessoa: a estreia, ou o dia em que
// ela entrou no app, o que for mais recente. Quem é contratado em novembro
// não precisa ver outubro inteiro como novidade.
function avisarDesde(perfilCriadoEm) {
  if (!perfilCriadoEm) return ESTREIA;
  return new Date(perfilCriadoEm) > new Date(ESTREIA) ? new Date(perfilCriadoEm).toISOString() : ESTREIA;
}

// Item criado antes do corte conta como já lido.
const antesDoCorte = (criadoEm, desde) => !!criadoEm && new Date(criadoEm) < new Date(desde);

// Mapa item_id → data da última visita (ISO), só dos itens pedidos.
async function vistosDe(userId, tipo, ids) {
  if (!userId || !TIPOS.includes(tipo) || !ids?.length) return {};
  try {
    const { data } = await supabase
      .from('leituras').select('item_id, visto_em')
      .eq('user_id', userId).eq('tipo', tipo).in('item_id', ids);
    return Object.fromEntries((data || []).map(l => [l.item_id, l.visto_em]));
  } catch { return {}; }
}

// Marca agora como a última visita. Upsert: a segunda visita ATUALIZA a
// data — é isso que faz o comentário novo de amanhã voltar a contar.
async function marcarVisto(userId, tipo, itemId) {
  if (!userId || !TIPOS.includes(tipo) || !itemId) return;
  try {
    await supabase.from('leituras')
      .upsert({ user_id: userId, tipo, item_id: itemId, visto_em: new Date().toISOString() },
              { onConflict: 'user_id,tipo,item_id' });
  } catch { /* marcar leitura nunca pode derrubar a rota */ }
}

// Quantos comentários cada item tem, e quantos são novos para a pessoa.
// Uma consulta só para a lista inteira — uma por card deixaria a tela lenta.
async function comentariosPorItem(tabela, coluna, ids, vistos, userId, desde = ESTREIA) {
  const mapa = {};
  if (!ids?.length) return mapa;
  try {
    const { data } = await supabase.from(tabela).select(`${coluna}, user_id, created_at`).in(coluna, ids);
    for (const c of data || []) {
      const id = c[coluna];
      const acc = mapa[id] || (mapa[id] = { total: 0, novos: 0 });
      acc.total++;
      // O próprio comentário nunca é novidade para quem escreveu.
      if (c.user_id === userId) continue;
      // Nem o que é anterior ao corte (ver ESTREIA).
      if (antesDoCorte(c.created_at, desde)) continue;
      // Sem visita registrada, todo comentário é novo — é a primeira vez
      // que a pessoa vê o item.
      const visto = vistos?.[id];
      if (!visto || new Date(c.created_at) > new Date(visto)) acc.novos++;
    }
    return mapa;
  } catch { return mapa; }
}

module.exports = { vistosDe, marcarVisto, comentariosPorItem, avisarDesde, antesDoCorte, ESTREIA };
