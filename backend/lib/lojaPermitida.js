const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// DE QUAL LOJA ESTA PESSOA PODE VER OS DADOS.
//
// Decidido AQUI, pelo perfil — nunca pelo que a tela manda. A tela diz
// qual loja está aberta (master e dono de grupo trocam de loja); esta
// função diz se pode:
//
//   • master          → qualquer loja
//   • dono de grupo   → as lojas do grupo dele (admin com `grupo`,
//                       conferido em `stores.grupo` — mesma regra de logs.js)
//   • os demais       → só a própria
//
// Pedido de loja não permitida vira a própria, em silêncio: a tela
// continua funcionando, só que com o que é da pessoa.
//
// Existe porque a Agenda (e o PDF e o WhatsApp dela) buscava SEM empresa
// quando a tela não mandava uma — e a tela nunca mandava. Qualquer usuário
// via os compromissos "gerais" de todas as empresas do sistema (out/2026).
// ─────────────────────────────────────────────────────────────

async function perfilDe(id) {
  if (!id) return null;
  const { data } = await supabase.from('profiles')
    .select('id, access_level, company, grupo').eq('id', id).maybeSingle();
  return data || null;
}

async function lojaPermitida(me, pedida) {
  if (!me) return null;
  const alvo = String(pedida || '').trim();
  if (!alvo || alvo === me.company) return me.company || null;
  if (me.access_level === 'master') return alvo;
  if (me.grupo && me.access_level === 'admin') {
    const { data: loja } = await supabase.from('stores').select('grupo').eq('name', alvo).maybeSingle();
    if (loja?.grupo && loja.grupo === me.grupo) return alvo;
  }
  return me.company || null;
}

module.exports = { perfilDe, lojaPermitida };
