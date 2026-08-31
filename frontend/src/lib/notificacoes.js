import api from '../api';

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÕES — ETAPA 1
//
// Cada função devolve um resultado descritivo em vez de só falhar. No iOS
// quase toda falha é silenciosa: a permissão fica marcada como concedida e
// nada chega. Dizer exatamente onde parou é o que evita adivinhação.
// ─────────────────────────────────────────────────────────────

export function ehIOS() {
  const ua = navigator.userAgent || '';
  // iPad moderno se identifica como Mac; o toque na tela é o que o separa.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// No iOS, notificação só existe com o app instalado na tela de início.
// Aberto pelo Safari comum, nada funciona — e nada avisa o usuário.
export function instaladoNaTelaDeInicio() {
  try {
    if (window.navigator.standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function suportaNotificacoes() {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

// Diz o que o app consegue fazer agora, para a tela orientar em vez de só
// mostrar um botão que não vai funcionar.
export function situacaoAtual() {
  if (!suportaNotificacoes()) {
    return ehIOS() && !instaladoNaTelaDeInicio()
      ? { estado: 'precisa_instalar' }
      : { estado: 'sem_suporte' };
  }
  if (ehIOS() && !instaladoNaTelaDeInicio()) return { estado: 'precisa_instalar' };
  if (Notification.permission === 'denied')  return { estado: 'bloqueado' };
  if (Notification.permission === 'granted') return { estado: 'permitido' };
  return { estado: 'pode_ativar' };
}

function chaveParaBytes(base64) {
  const preenchimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(normalizada);
  return Uint8Array.from([...bruto].map(c => c.charCodeAt(0)));
}

// PRECISA ser chamada direto do clique do usuário.
export async function ativarNotificacoes(userId) {
  if (!userId) return { ok: false, motivo: 'sem_usuario' };

  const situacao = situacaoAtual();
  if (situacao.estado === 'precisa_instalar') return { ok: false, motivo: 'precisa_instalar' };
  if (situacao.estado === 'sem_suporte')      return { ok: false, motivo: 'sem_suporte' };
  if (situacao.estado === 'bloqueado')        return { ok: false, motivo: 'bloqueado' };

  // A permissão é pedida ANTES de qualquer espera. Se aguardarmos o service
  // worker primeiro, o navegador já não reconhece a chamada como vinda de um
  // clique e recusa sem chegar a perguntar nada ao usuário.
  let permissao;
  try {
    permissao = await Notification.requestPermission();
  } catch {
    return { ok: false, motivo: 'erro_permissao' };
  }
  if (permissao !== 'granted') return { ok: false, motivo: 'recusado' };

  try {
    const registro = await navigator.serviceWorker.ready;

    const { data } = await api.get('/notificacoes/chave-publica');
    if (!data?.chavePublica) return { ok: false, motivo: 'servidor_sem_chave' };

    // Reaproveita a inscrição existente. Criar outra por cima deixaria a
    // anterior órfã no banco, recebendo envios que não chegam a lugar nenhum.
    let inscricao = await registro.pushManager.getSubscription();
    if (!inscricao) {
      inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(data.chavePublica),
      });
    }

    await guardarConfig(userId, data.chavePublica);

    const resposta = await api.post('/notificacoes/inscrever', {
      user_id: userId,
      inscricao: inscricao.toJSON(),
    });

    return { ok: true, servico: resposta.data?.servico || null };
  } catch (e) {
    return { ok: false, motivo: 'erro_inscricao', detalhe: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────
// ETAPA 2 — o registro se mantém sozinho.
//
// O navegador troca a inscrição por conta própria: reinstalação do app,
// restauração de backup, limpeza do sistema. Quando isso acontece, a linha
// no banco vira lixo e a pessoa para de receber sem nenhum aviso — foi
// assim que sobraram duas inscrições de iPhone, uma delas morta.
// ─────────────────────────────────────────────────────────────

// Guarda o necessário para o service worker conseguir se reinscrever
// sozinho quando o navegador trocar a inscrição — ele não tem acesso à
// sessão nem à tela, então precisa desses dados por perto.
// Estes dois nomes têm que bater com os do sw.js — é lá que a configuração
// é lida, e a limpeza de caches antigos preserva este depósito por nome.
const DEPOSITO_PUSH = 'rota-push';
const CONFIG_PUSH   = '/__push-config';

async function guardarConfig(userId, chavePublica) {
  try {
    const deposito = await caches.open(DEPOSITO_PUSH);
    await deposito.put(CONFIG_PUSH, new Response(JSON.stringify({ usuario: userId, chave: chavePublica })));
  } catch { /* sem cache: perde só a reinscrição automática */ }
}

// Chamada a cada abertura do app, quando a permissão já foi concedida.
// Barata (só atualiza a linha) e é o que mantém o cadastro em dia depois de
// uma reinstalação.
export async function registrarSeJaPermitido(userId) {
  if (!userId || !suportaNotificacoes()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const registro = await navigator.serviceWorker.ready;
    const inscricao = await registro.pushManager.getSubscription();
    if (!inscricao) return; // sem inscrição: só o usuário pode recriar, com um clique

    const { data } = await api.get('/notificacoes/chave-publica');
    if (data?.chavePublica) await guardarConfig(userId, data.chavePublica);

    await api.post('/notificacoes/inscrever', { user_id: userId, inscricao: inscricao.toJSON() });
  } catch { /* silencioso: é manutenção de fundo, não pode atrapalhar o login */ }
}

export async function enviarTeste(userId) {
  const { data } = await api.post('/notificacoes/teste', { user_id: userId });
  return data;
}

// Desfaz a inscrição DESTE aparelho. Chamada ao sair da conta.
//
// Em loja o computador é compartilhado: sem isto, quem saiu continuaria
// recebendo notificação naquela máquina — inclusive a prévia de mensagem
// privada, na tela de quem ficou depois.
// Espera no máximo `ms` e desiste. Existe porque nem toda espera termina em
// erro: algumas simplesmente não terminam, e um `catch` não pega isso.
function comLimite(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function removerInscricaoDesteAparelho() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // navigator.serviceWorker.ready NUNCA resolve se não houver service
    // worker registrado — não rejeita, fica pendurado para sempre. Em janela
    // anônima, ou em quem nunca ativou notificação, isso travava o botão de
    // sair da conta. Descoberto quando o logout parou de responder.
    const registro = await comLimite(navigator.serviceWorker.ready, 2000);
    if (!registro) return;
    const inscricao = await registro.pushManager.getSubscription();
    if (!inscricao) return;

    // Some do banco (para o servidor parar de enviar) e do navegador (para
    // o aparelho parar de aceitar). Só um dos dois deixaria brecha.
    // Limite curto próprio: o padrão do app é 90 segundos, tempo demais para
    // segurar alguém que só quer sair. Se o servidor estiver lento, some do
    // navegador agora e o registro no banco cai no próximo login.
    await api.delete('/notificacoes/inscricao', {
      data: { endpoint: inscricao.endpoint },
      timeout: 4000,
    }).catch(() => {});
    await inscricao.unsubscribe().catch(() => {});

    // A configuração guardada traz o id de quem estava logado: sair sem
    // apagá-la deixaria o service worker se reinscrevendo por essa pessoa.
    const deposito = await caches.open(DEPOSITO_PUSH);
    await deposito.delete(CONFIG_PUSH);
  } catch { /* sair da conta nunca pode falhar por causa disto */ }
}

// Onde a pessoa está registrada para receber. Falha aqui é silenciosa: é
// informação de apoio e não pode atrapalhar a tela de perfil.
export async function meusAparelhos(userId) {
  if (!userId) return null;
  try {
    const { data } = await api.get(`/notificacoes/meus-aparelhos?requester_id=${userId}`);
    return data?.aparelhos || [];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Versão do service worker ativa neste aparelho.
//
// Quem exibe a notificação é o service worker, e ele tem ciclo de vida
// próprio: a tela pode estar atualizada enquanto ele continua sendo o
// antigo. O iOS segura o antigo por bastante tempo em app instalado. Sem
// enxergar essa versão, "o push não chegou" e "chegou mas o código velho
// não sabia exibir" são indistinguíveis.
// ─────────────────────────────────────────────────────────────
export const VERSAO_ESPERADA = 'rota2-v22';

const AVISO_REINSTALACAO = 'rota_push_precisa_registrar';

// Consumido uma única vez: o recado só faz sentido logo após a reinstalação.
export function consumirAvisoDeReinstalacao() {
  try {
    if (localStorage.getItem(AVISO_REINSTALACAO) !== '1') return false;
    localStorage.removeItem(AVISO_REINSTALACAO);
    return true;
  } catch {
    return false;
  }
}

export async function versaoAtiva() {
  if (!('serviceWorker' in navigator)) return 'sem service worker';
  try {
    // Sem prazo, `ready` pode nunca resolver e a tela ficaria sem informação
    // nenhuma — que é o pior resultado possível aqui, porque parece "tudo
    // certo" quando na verdade é "não sei dizer".
    const registro = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('demorou')), 4000)),
    ]);
    if (!registro.active) return 'nenhum ativo';
    return await new Promise(resolve => {
      const canal = new MessageChannel();
      // Versão antiga não responde a esta mensagem — o silêncio é a resposta.
      const prazo = setTimeout(() => resolve('versão antiga'), 2500);
      canal.port1.onmessage = e => {
        clearTimeout(prazo);
        resolve(e.data?.versao || 'versão antiga');
      };
      registro.active.postMessage({ tipo: 'VERSAO' }, [canal.port2]);
    });
  } catch {
    return 'não foi possível verificar';
  }
}

// Coloca a versão nova no ar. Tenta o caminho normal e, se ele não resolver,
// recorre a apagar o registro e começar do zero.
//
// Devolve como terminou, para a tela poder avisar quando a inscrição precisa
// ser refeita — apagar o registro leva a inscrição junto, e sem avisar a
// pessoa ficaria achando que está tudo certo enquanto nada chega.
export async function atualizarAplicativo() {
  const registro = await navigator.serviceWorker.ready;

  try { await registro.update(); } catch { /* tenta o resto mesmo assim */ }

  // Espera instalar e assumir. Sem isso a página voltaria com o service
  // worker antigo ainda no comando.
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if ((await versaoAtiva()) === VERSAO_ESPERADA) {
      window.location.reload();
      return { via: 'atualizacao' };
    }
  }

  // O caminho normal falhou. Apagar o registro força o navegador a buscar
  // tudo de novo na próxima abertura — é o que destrava aparelho preso numa
  // versão antiga, e no iOS isso acontece com frequência.
  try {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map(r => r.unregister()));
    if ('caches' in window) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map(k => caches.delete(k)));
    }
  } catch { /* segue para o recarregamento de qualquer forma */ }

  // A página recarrega antes de conseguir mostrar qualquer aviso, então o
  // recado fica guardado para a tela exibir do outro lado. Sem ele a pessoa
  // acharia que está tudo certo enquanto a inscrição não existe mais.
  try { localStorage.setItem(AVISO_REINSTALACAO, '1'); } catch { /* aba anônima */ }

  window.location.reload();
  return { via: 'reinstalacao' };
}
