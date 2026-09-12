const supabase = require('../supabase');
const { logAction, logError } = require('./auditLog');

// ─────────────────────────────────────────────────────────────
// Assinatura da loja: o que acontece quando o dinheiro vai e volta.
//
// UM MECANISMO SÓ. A loja inativa bloqueia todo mundo dela, e três coisas
// diferentes deixam a loja inativa: reembolso ou chargeback na Hotmart,
// assinatura vencida sem renovação, e o master desativando à mão.
//
// Antes disso, nada bloqueava. O webhook só tratava a compra aprovada e
// ignorava reembolso, cancelamento e atraso: um mês pago comprava acesso
// permanente para a loja inteira. E "Desativar loja" no painel do master só
// marcava a loja como inativa — os usuários dela continuavam entrando.
//
// O BLOQUEIO É POR PESSOA, com marca. Desativar a loja desliga os perfis
// dela (active = false, que a tela de login já respeita) e marca cada um
// com bloqueado_pela_loja. Reativar liga de volta SÓ os marcados: quem o
// gestor havia desligado por conta própria antes do bloqueio continua
// desligado, e não ressuscita junto com a loja.
// ─────────────────────────────────────────────────────────────

async function lojaPorNome(nome) {
  if (!nome) return null;
  const { data } = await supabase
    .from('stores').select('id, name, active, acesso_ate, motivo_bloqueio')
    .eq('name', nome).maybeSingle();
  return data || null;
}

// O e-mail da compra é o mesmo do cadastro — o /ativar-conta exige isso.
// Então o e-mail que a Hotmart manda aponta direto para a loja.
async function lojaPorEmail(email) {
  if (!email) return { perfil: null, loja: null };
  const { data: perfil } = await supabase
    .from('profiles').select('id, full_name, company, access_level, active')
    .ilike('email', String(email).trim()).maybeSingle();
  if (!perfil?.company) return { perfil: perfil || null, loja: null };
  return { perfil, loja: await lojaPorNome(perfil.company) };
}

async function avisarMaster(titulo, mensagem, rota) {
  try {
    const { data: donos } = await supabase
      .from('profiles').select('id').eq('access_level', 'master').eq('active', true);
    const ids = (donos || []).map(d => d.id);
    if (!ids.length) return;
    // require dentro da função: notificacoes -> auditLog -> assinatura
    // formaria ciclo se fosse no topo.
    const { enviarPush } = require('./notificacoes');
    await enviarPush(ids, titulo, mensagem, 'geral', { rota });
  } catch (e) {
    console.error('[assinatura] falha ao avisar o master:', e.message);
  }
}

async function bloquearLoja(loja, motivo, { quem = null, rota = null } = {}) {
  if (!loja) return { ok: false, erro: 'loja não encontrada' };

  const { error: e1 } = await supabase
    .from('stores')
    .update({ active: false, motivo_bloqueio: motivo })
    .eq('id', loja.id);
  if (e1) {
    logError({ company: loja.name, user_id: quem, acao: 'bloquear_loja', tabela: 'stores', rota, erro_mensagem: e1.message });
    return { ok: false, erro: e1.message };
  }

  // Só quem estava ativo recebe a marca. Quem já estava desligado por outro
  // motivo fica como está — e por isso não volta na reativação.
  const { data: desligados, error: e2 } = await supabase
    .from('profiles')
    .update({ active: false, bloqueado_pela_loja: true })
    .eq('company', loja.name).eq('active', true)
    .neq('access_level', 'master')
    .select('id');
  if (e2) {
    logError({ company: loja.name, user_id: quem, acao: 'bloquear_loja', tabela: 'profiles', rota, erro_mensagem: e2.message });
  }

  const quantos = (desligados || []).length;
  logAction({
    company: loja.name, user_id: quem, acao: 'bloquear_loja', tabela: 'stores',
    antes: { ativa: true }, depois: { ativa: false, motivo, pessoas_bloqueadas: quantos },
  });
  await avisarMaster('🔒 Loja bloqueada',
    `${loja.name}: ${motivo}. ${quantos} pessoa(s) perderam o acesso.`, rota);
  return { ok: true, pessoas: quantos };
}

async function reativarLoja(loja, { quem = null, rota = null, acessoAte = null } = {}) {
  if (!loja) return { ok: false, erro: 'loja não encontrada' };

  const { error: e1 } = await supabase
    .from('stores')
    .update({ active: true, motivo_bloqueio: null, ...(acessoAte ? { acesso_ate: acessoAte } : {}) })
    .eq('id', loja.id);
  if (e1) {
    logError({ company: loja.name, user_id: quem, acao: 'reativar_loja', tabela: 'stores', rota, erro_mensagem: e1.message });
    return { ok: false, erro: e1.message };
  }

  const { data: religados } = await supabase
    .from('profiles')
    .update({ active: true, bloqueado_pela_loja: false })
    .eq('company', loja.name).eq('bloqueado_pela_loja', true)
    .select('id');

  const quantos = (religados || []).length;
  logAction({
    company: loja.name, user_id: quem, acao: 'reativar_loja', tabela: 'stores',
    antes: { ativa: false }, depois: { ativa: true, pessoas_religadas: quantos, acesso_ate: acessoAte },
  });
  return { ok: true, pessoas: quantos };
}

async function definirAcessoAte(loja, data, { quem = null, origem = null } = {}) {
  if (!loja || !data) return;
  const { error } = await supabase.from('stores').update({ acesso_ate: data }).eq('id', loja.id);
  if (error) {
    logError({ company: loja.name, user_id: quem, acao: 'definir_acesso_ate', tabela: 'stores', erro_mensagem: error.message });
    return;
  }
  logAction({ company: loja.name, user_id: quem, acao: 'definir_acesso_ate', tabela: 'stores',
              antes: { acesso_ate: loja.acesso_ate }, depois: { acesso_ate: data, origem } });
}

// Data "acesso até" a partir do que a Hotmart manda.
//
// Para assinatura, date_next_charge é a próxima cobrança: o acesso vale até
// lá, mais três dias de folga para a cobrança processar. Sem esse campo —
// payload diferente, compra avulsa — cai em 35 dias e registra de onde veio,
// para o primeiro evento real mostrar se a leitura está certa.
function calcularAcessoAte(dados) {
  const candidatos = [
    dados?.purchase?.date_next_charge,
    dados?.subscription?.date_next_charge,
    dados?.purchase?.next_charge_date,
  ].filter(v => v !== undefined && v !== null && v !== '');

  let base = null, origem = 'padrão de 35 dias';
  for (const v of candidatos) {
    const n = Number(v);
    const d = Number.isFinite(n) ? new Date(n > 1e11 ? n : n * 1000) : new Date(v);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) { base = d; origem = 'date_next_charge'; break; }
  }
  if (!base) { base = new Date(); base.setUTCDate(base.getUTCDate() + 35); }
  else { base.setUTCDate(base.getUTCDate() + 3); }

  return { data: base.toISOString().slice(0, 10), origem };
}

// Lojas cuja data passou. Só loja COM data vence: as que existem sem data —
// as criadas antes disto, as que não vieram da Hotmart — nunca são tocadas.
async function bloquearVencidas({ rota = null } = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: vencidas, error } = await supabase
    .from('stores').select('id, name, active, acesso_ate, motivo_bloqueio')
    .eq('active', true).not('acesso_ate', 'is', null).lt('acesso_ate', hoje);
  if (error) {
    logError({ acao: 'verificar_vencimentos', tabela: 'stores', rota, erro_mensagem: error.message });
    return { ok: false, erro: error.message };
  }
  const resultado = [];
  for (const loja of (vencidas || [])) {
    const r = await bloquearLoja(loja, `assinatura vencida em ${loja.acesso_ate}, sem renovação`, { rota });
    resultado.push({ loja: loja.name, ...r });
  }
  return { ok: true, bloqueadas: resultado };
}

module.exports = { lojaPorNome, lojaPorEmail, bloquearLoja, reativarLoja, definirAcessoAte, calcularAcessoAte, bloquearVencidas, avisarMaster };
