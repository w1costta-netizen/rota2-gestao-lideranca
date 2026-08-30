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

    const resposta = await api.post('/notificacoes/inscrever', {
      user_id: userId,
      inscricao: inscricao.toJSON(),
    });

    return { ok: true, servico: resposta.data?.servico || null };
  } catch (e) {
    return { ok: false, motivo: 'erro_inscricao', detalhe: e?.message || String(e) };
  }
}

export async function enviarTeste(userId) {
  const { data } = await api.post('/notificacoes/teste', { user_id: userId });
  return data;
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
export const VERSAO_ESPERADA = 'rota2-v18';

export async function versaoAtiva() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registro = await navigator.serviceWorker.ready;
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
    return null;
  }
}

// Busca a versão nova e a coloca no ar. O service worker já usa skipWaiting
// e clients.claim, então assim que a nova chega ela assume na hora.
export async function atualizarAplicativo() {
  const registro = await navigator.serviceWorker.ready;
  await registro.update();

  // Dá tempo de instalar e assumir antes de recarregar; sem esta espera a
  // página voltaria com o service worker antigo ainda no comando.
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if ((await versaoAtiva()) === VERSAO_ESPERADA) break;
  }
  window.location.reload();
}
