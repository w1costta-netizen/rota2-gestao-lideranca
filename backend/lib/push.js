const webpush = require('web-push');
const supabase = require('../supabase');
const { registrarLog } = require('./auditLog');

// NÃO TROCAR este endereço sem testar num iPhone de verdade. Ele vai
// assinado em cada envio; o Chrome ignora, mas a Apple valida. Trocá-lo
// por um endereço do domínio novo derrubou a entrega no iOS — e sem
// nenhum erro: a Apple seguia respondendo "aceito" e nada chegava.
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@rota2.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Retorna user_ids afetados pelo targetType
async function getAffectedUserIds(targetType, targetValue, requesterCompany) {
  // lider = targetValue é o user_id diretamente
  if (targetType === 'lider') return targetValue ? targetValue.split(',').filter(Boolean) : [];

  let query = supabase.from('profiles').select('id').eq('active', true).eq('company', requesterCompany);
  if (targetType === 'setor') query = query.eq('sector', targetValue);

  const { data } = await query;
  return data ? data.map(d => d.id) : [];
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO CENTRAL DE ENVIO
//
//   enviarPush(userIds, { titulo, mensagem, tipo, pagina })
//
// Toda funcionalidade nova deve usar esta função — assim ganha de
// graça a limpeza de dispositivo inválido e o registro de falha no
// log de auditoria, sem precisar reimplementar nada.
//
// Retorna { enviados, falhas, semDispositivo, codigos }.
// Nunca lança exceção: push é acessório e não pode derrubar a ação
// que o usuário está fazendo.
// ─────────────────────────────────────────────────────────────
async function enviarPush(userIds, { titulo, mensagem, tipo = 'geral', pagina = 'dashboard', company = null } = {}) {
  const vazio = { enviados: 0, falhas: 0, semDispositivo: 0, codigos: [] };
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
    if (!ids.length) return vazio;

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      registrarLog('enviar_push', 'push_subscriptions', 'erro', {
        company, acao_origem: tipo,
        erro: 'VAPID não configurado no servidor — nenhum push é entregue',
      });
      return vazio;
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, endpoint, user_id')
      .in('user_id', ids);

    // Ninguém do grupo tem dispositivo registrado. Não é erro do sistema
    // (a pessoa pode nunca ter ativado), mas registrar ajuda a explicar
    // o clássico "ativei a notificação e não chega nada".
    if (!subs?.length) {
      registrarLog('enviar_push', 'push_subscriptions', 'erro', {
        company, user_id: ids[0],
        erro: `Nenhum dispositivo registrado para ${ids.length} destinatário(s) — push "${titulo}" não entregue`,
      });
      return { ...vazio, semDispositivo: ids.length };
    }

    const payload = JSON.stringify({ title: titulo, body: mensagem, page: pagina });
    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(s.subscription, payload))
    );

    // 404/410 = dispositivo não existe mais (app desinstalado, cache limpo).
    // Precisa sair do banco, senão fica sujando toda tentativa futura.
    const invalidos = [];
    const codigos = [];
    results.forEach((r, i) => {
      if (r.status !== 'rejected') return;
      const code = r.reason?.statusCode;
      codigos.push(code || r.reason?.message || 'erro');
      if (code === 404 || code === 410) invalidos.push(subs[i]);
    });

    if (invalidos.length) {
      await supabase.from('push_subscriptions')
        .delete()
        .in('endpoint', invalidos.map(s => s.endpoint || s.subscription?.endpoint).filter(Boolean));
    }

    const enviados = results.filter(r => r.status === 'fulfilled').length;
    const falhas   = results.length - enviados;

    // Falha que NÃO é dispositivo removido merece investigação — 403, por
    // exemplo, costuma ser chave VAPID trocada: a permissão continua ativa
    // no celular e nada chega, sem nenhum sinal para o usuário.
    const falhasReais = falhas - invalidos.length;
    if (falhasReais > 0) {
      registrarLog('enviar_push', 'push_subscriptions', 'erro', {
        company, user_id: ids[0],
        erro: `Falha ao enviar push "${titulo}" (${tipo}): ${falhasReais} de ${results.length} — códigos: ${codigos.join(', ')}`,
      });
    }

    return { enviados, falhas, semDispositivo: 0, codigos };
  } catch (e) {
    try {
      registrarLog('enviar_push', 'push_subscriptions', 'erro', {
        company, erro: `Erro inesperado ao enviar push (${tipo}): ${e.message}`,
      });
    } catch { /* nada a fazer */ }
    return vazio;
  }
}

// Compatibilidade: dezenas de chamadas já usam este formato. Ambas caem
// no enviarPush acima, então ganham as mesmas correções.
async function sendPushToUsers(userIds, payload) {
  const r = await enviarPush(userIds, {
    titulo: payload?.title,
    mensagem: payload?.body,
    pagina: payload?.page,
    tipo: payload?.tipo || 'geral',
  });
  return r.enviados;
}

async function sendPushToTargets({ targetType, targetValue, company, payload }) {
  try {
    const userIds = await getAffectedUserIds(targetType, targetValue, company);
    const r = await enviarPush(userIds, {
      titulo: payload?.title,
      mensagem: payload?.body,
      pagina: payload?.page,
      tipo: payload?.tipo || 'geral',
      company,
    });
    return r.enviados;
  } catch (e) {
    registrarLog('enviar_push', 'push_subscriptions', 'erro', {
      company, erro: `Erro ao resolver destinatários (${targetType}): ${e.message}`,
    });
    return 0;
  }
}

module.exports = { enviarPush, sendPushToTargets, sendPushToUsers };
