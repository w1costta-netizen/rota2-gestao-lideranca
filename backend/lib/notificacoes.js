const webpush  = require('web-push');
const supabase = require('../supabase');
const { registrarLog } = require('./auditLog');

// ─────────────────────────────────────────────────────────────
// ETAPA 3 — ponto único de envio de notificação.
//
// Todo módulo do app manda push por aqui. O motivo é concreto: no sistema
// anterior cada rota montava o envio do seu jeito, e quando algo quebrava
// era preciso caçar e corrigir doze lugares diferentes — foi o que
// aconteceu com a notificação escrita "undefined".
// ─────────────────────────────────────────────────────────────

// Endereço de contato exigido pelo padrão Web Push. Vai assinado dentro de
// cada envio e a Apple valida com rigor.
//
// NÃO TROCAR. Fica fixo aqui de propósito, sem variável de ambiente, para
// que ninguém consiga mudá-lo sem perceber — uma troca desse valor não gera
// erro visível, só faz a entrega parar de funcionar em alguns aparelhos.
const CONTATO_VAPID = 'mailto:contato@rotalider.com.br';

const CHAVE_PUBLICA = process.env.VAPID_PUBLIC_KEY;
const CHAVE_PRIVADA = process.env.VAPID_PRIVATE_KEY;
const configurado   = Boolean(CHAVE_PUBLICA && CHAVE_PRIVADA);

if (configurado) {
  webpush.setVapidDetails(CONTATO_VAPID, CHAVE_PUBLICA, CHAVE_PRIVADA);
} else {
  console.error('[notificacoes] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — nenhum push será entregue');
}

// Para o diagnóstico ficar legível: saber que o push foi para um iPhone e
// não para o Chrome muda completamente o que investigar.
function servicoDoEndereco(endereco = '') {
  if (endereco.includes('web.push.apple.com'))   return 'iPhone/iPad (Safari)';
  if (endereco.includes('fcm.googleapis.com'))   return 'Chrome/Android';
  if (endereco.includes('mozilla.com'))          return 'Firefox';
  if (endereco.includes('notify.windows.com'))   return 'Edge/Windows';
  return 'outro navegador';
}

// Onde o toque na notificação deve levar a pessoa. Sem isso a notificação
// avisa mas não leva a lugar nenhum, e ela tem que procurar o que mudou.
const PAGINA_POR_TIPO = {
  tarefa:     'tarefas',
  agenda:     'agenda',
  mural:      'mural',
  comunicado: 'comunicados',
  ata:        'atas',
  chat:       'chat',
  loja:       'dashboard',
  geral:      'dashboard',
};

/**
 * Envia uma notificação. É o único ponto de envio do app.
 *
 * Nunca lança erro: o push é sempre efeito secundário de uma ação do
 * usuário (criar tarefa, publicar comunicado), e uma falha de notificação
 * não pode derrubar a ação principal.
 *
 * @param {string|string[]} usuarios  quem recebe (id ou lista de ids)
 * @param {string} titulo             primeira linha da notificação
 * @param {string} mensagem           corpo da notificação
 * @param {string} tipo               tarefa | agenda | mural | comunicado | ata | loja | geral
 * @param {object} [opcoes]           { company, rota, confirmarRecebimento }
 * @returns {Promise<{enviados:number, removidos:number, aparelhos:Array}>}
 */
async function enviarPush(usuarios, titulo, mensagem, tipo = 'geral', opcoes = {}) {
  const resultado = { enviados: 0, removidos: 0, aparelhos: [] };
  try {
    if (!configurado) return resultado;

    // Sem duplicados e sem vazios: notificar a mesma pessoa duas vezes pelo
    // mesmo evento é o tipo de coisa que faz desligarem a notificação.
    const ids = [...new Set((Array.isArray(usuarios) ? usuarios : [usuarios]).filter(Boolean))];
    if (!ids.length) return resultado;

    const pagina = PAGINA_POR_TIPO[tipo] || 'dashboard';

    for (const id of ids) {
      const { data: inscricoes } = await supabase
        .from('push_subscriptions').select('endpoint, subscription').eq('user_id', id);
      if (!inscricoes?.length) continue;

      // O conteúdo vai nos dois formatos de nome. Aparelho com service
      // worker antigo lê `title`/`body`; sem isso ele exibiria a notificação
      // escrita "undefined", que foi um defeito real deste sistema.
      const conteudo = JSON.stringify({
        titulo, mensagem, pagina,
        title: titulo, body: mensagem,
        // Só o teste pede confirmação de recebimento. Nos envios do dia a
        // dia isso encheria os Logs de uma linha por notificação entregue.
        ...(opcoes.confirmarRecebimento ? { usuario: id } : {}),
      });

      const mortas = [];
      for (const item of inscricoes) {
        const servico = servicoDoEndereco(item.endpoint);
        try {
          const r = await webpush.sendNotification(item.subscription, conteudo);
          resultado.enviados++;
          resultado.aparelhos.push({ servico, aceito: true, codigo: r?.statusCode ?? 201 });
        } catch (e) {
          const codigo = e?.statusCode || null;
          // 404 e 410 significam que o aparelho não existe mais para o
          // serviço de push. Insistir nunca vai funcionar, então some.
          const morta = codigo === 404 || codigo === 410;
          if (morta) mortas.push(item.endpoint);
          resultado.aparelhos.push({ servico, aceito: false, codigo, removida: morta });

          // Falha real precisa deixar rastro: é a diferença entre "ninguém
          // recebeu porque ninguém tinha o app" e "o envio está quebrado".
          // Aparelho que sumiu não gera log, senão viraria ruído.
          if (!morta) {
            registrarLog('enviar_push', 'push_subscriptions', 'erro', {
              company: opcoes.company || null,
              user_id: id,
              rota: opcoes.rota || null,
              erro: `${servico} recusou o envio${codigo ? ` (código ${codigo})` : ''}: ${e?.body || e?.message || 'sem detalhe'}`,
            });
          }
        }
      }

      if (mortas.length) {
        resultado.removidos += mortas.length;
        await supabase.from('push_subscriptions').delete().in('endpoint', mortas);
        registrarLog('limpar_inscricao_push', 'push_subscriptions', 'sucesso', {
          company: opcoes.company || null,
          user_id: id,
          depois: { removidas: mortas.length, motivo: 'aparelho não existe mais' },
        });
      }
    }
  } catch (e) {
    // Chegar aqui significa falha inesperada (banco fora do ar, por
    // exemplo). Fica registrado, mas nunca sobe para quem chamou.
    registrarLog('enviar_push', 'push_subscriptions', 'erro', {
      company: opcoes.company || null,
      rota: opcoes.rota || null,
      erro: `Falha inesperada ao enviar notificação: ${e?.message || e}`,
    });
  }
  return resultado;
}

/**
 * Todos os usuários ativos de uma loja, menos quem realizou a ação.
 *
 * Mural e comunicados avisam a loja inteira, e sem o `exceto` a pessoa
 * receberia notificação do que ela mesma acabou de publicar.
 *
 * Nunca lança erro: é insumo de notificação, e falhar aqui não pode
 * derrubar a publicação.
 */
async function usuariosDaLoja(company, exceto = null) {
  if (!company) return [];
  try {
    const { data } = await supabase
      .from('profiles').select('id').eq('company', company).eq('active', true);
    return (data || []).map(p => p.id).filter(id => id !== exceto);
  } catch {
    return [];
  }
}

module.exports = { enviarPush, usuariosDaLoja, servicoDoEndereco, configurado, CHAVE_PUBLICA };
