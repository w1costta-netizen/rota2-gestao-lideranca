import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { hasPermission } from './lib/permissions';
import { ToastProvider, useToast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { startAlarmEngine, stopAlarmEngine } from './lib/alarm';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';
import AceiteTermos from './pages/AceiteTermos';
import { VERSAO_ESPERADA } from './lib/notificacoes';

// Lazy-load de todas as páginas — reduz o bundle inicial em ~70%
//
// O tratamento de erro aqui não é zelo extra: é obrigatório.
// Cada publicação gera arquivos com nomes novos e apaga os antigos. Quem
// está com o app aberto nesse momento continua com a página velha na
// memória, apontando para arquivos que não existem mais. Ao abrir um
// módulo ainda não carregado, o pedido cai na regra "/* → index.html" da
// hospedagem e volta HTML no lugar de código — e a tela quebrava com
// "undefined is not an object". Recarregar busca o index novo e resolve.
const CHAVE_RECARGA = 'rota_recarga_versao';

const lazy = (fn) => React.lazy(() => fn().then(modulo => {
  // Carregou: a marca de "já recarreguei" sai, senão uma publicação futura
  // nesta mesma aba não teria direito à sua recarga.
  try { sessionStorage.removeItem(CHAVE_RECARGA); } catch { /* nada */ }
  return modulo;
}).catch(erro => {
  let jaTentou = false;
  try { jaTentou = sessionStorage.getItem(CHAVE_RECARGA) === '1'; } catch { /* modo privado */ }

  if (!jaTentou) {
    try { sessionStorage.setItem(CHAVE_RECARGA, '1'); } catch { /* nada */ }
    window.location.reload();
    // Promessa que nunca resolve: a tela some no recarregamento. Rejeitar
    // aqui faria o erro aparecer por um instante antes de a página trocar.
    return new Promise(() => {});
  }

  // Já recarregou e continua falhando — aí é problema de verdade (rede caiu,
  // arquivo corrompido). Deixa subir para o ErrorBoundary, que avisa direito.
  throw erro;
}));
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const Leaders                = lazy(() => import('./pages/Leaders'));
const Agenda                 = lazy(() => import('./pages/Agenda'));
const Listas                 = lazy(() => import('./pages/Listas'));
const Anotacoes              = lazy(() => import('./pages/Anotacoes'));
const DiarioBordo            = lazy(() => import('./pages/DiarioBordo'));
const Chat                   = lazy(() => import('./pages/Chat'));
const AtaReuniao             = lazy(() => import('./pages/AtaReuniao'));
const Scale                  = lazy(() => import('./pages/Scale'));
const Profile                = lazy(() => import('./pages/Profile'));
const CashierAnalysis        = lazy(() => import('./pages/CashierAnalysis'));
const TeamMembers            = lazy(() => import('./pages/TeamMembers'));
const NativeSchedule         = lazy(() => import('./pages/NativeSchedule'));
const UsersAdmin             = lazy(() => import('./pages/UsersAdmin'));
const Comunicados            = lazy(() => import('./pages/Comunicados'));
const Tarefas                = lazy(() => import('./pages/Tarefas'));
const Mural                  = lazy(() => import('./pages/Mural'));
const Campanhas              = lazy(() => import('./pages/Campanhas'));
const RelatoriosFotograficos = lazy(() => import('./pages/RelatoriosFotograficos'));
const ConferenciaSecao       = lazy(() => import('./pages/ConferenciaSecao'));
const GestaoVendas           = lazy(() => import('./pages/GestaoVendas'));
const PainelVendas           = lazy(() => import('./pages/PainelVendas'));
const MasterDashboard        = lazy(() => import('./pages/MasterDashboard'));
const StoreSetup             = lazy(() => import('./pages/StoreSetup'));
const Estoque                = lazy(() => import('./pages/Estoque'));
const ImportadorEstoque      = lazy(() => import('./pages/ImportadorEstoque'));
const Organograma            = lazy(() => import('./pages/Organograma'));
const PlanoAcao              = lazy(() => import('./pages/PlanoAcao'));
const LogsAuditoria          = lazy(() => import('./pages/LogsAuditoria'));
const Produtividade          = lazy(() => import('./pages/Produtividade'));

function AccessDenied() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      minHeight:'60vh', gap:12, color:'var(--text-muted)' }}>
      <span style={{ fontSize:40 }}>🔒</span>
      <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)' }}>Acesso restrito</h2>
      <p style={{ fontSize:13 }}>Você não tem permissão para acessar esta área.</p>
    </div>
  );
}

const SIDEBAR_MIN = 60;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 240;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

function AppContent() {
  const { session, profile, signOut, loadProfile } = useAuth();
  const toast = useToast();
  // Restaura a última página visitada — evita voltar pro dashboard quando o
  // celular descarrega o app da memória (ao trocar de aplicativo, abrir a
  // câmera/galeria etc.). Precisa ser localStorage: o sessionStorage é
  // apagado exatamente nesse cenário, que é o que queremos cobrir.
  const [page, setPageState] = useState(() => {
    try {
      return localStorage.getItem('current_page') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const setPage = useCallback((p) => {
    try { localStorage.setItem('current_page', p); } catch { /* aba anônima */ }
    setPageState(p);
  }, []);
  const [authPage, setAuthPage] = useState('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewingStore, setViewingStore] = useState(() =>
    localStorage.getItem('master_viewing_store') || ''
  );
  const isMobile = useIsMobile();
  const [sidebarW, setSidebarW] = useState(
    () => parseInt(localStorage.getItem('sidebarWidth') || SIDEBAR_DEFAULT)
  );
  const dragging    = useRef(false);
  const startX      = useRef(0);
  const startW      = useRef(0);
  const sidebarRef  = useRef(null);
  const handleRef   = useRef(null);
  const mainRef     = useRef(null);

  const applyWidth = useCallback((w) => {
    // Atualiza DOM diretamente — sem re-render React
    if (sidebarRef.current) sidebarRef.current.style.width = w + 'px';
    if (handleRef.current)  handleRef.current.style.left   = (w - 3) + 'px';
    if (mainRef.current)    mainRef.current.style.marginLeft = w + 'px';
  }, []);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sidebarW;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarW]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + e.clientX - startX.current));
      applyWidth(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      // Lê o width atual do DOM e sincroniza com React state (1 único re-render)
      const finalW = sidebarRef.current
        ? parseInt(sidebarRef.current.style.width) || sidebarW
        : sidebarW;
      localStorage.setItem('sidebarWidth', finalW);
      setSidebarW(finalW);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [applyWidth, sidebarW]);

  const [swUpdate, setSwUpdate] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Detecta nova versão do SW disponível
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setSwUpdate(true);
          }
        });
      });
      // Procura versão nova a cada abertura. O iOS costuma manter o service
      // worker antigo por muito tempo em app instalado na tela de início, e
      // como é ele quem exibe as notificações, o aparelho fica recebendo
      // push sem mostrar nada — sem nenhum sinal de que está desatualizado.
      reg.update().catch(() => {});
    }).catch(() => {});
  }, []);

  // Engine de alarme — inicia quando o usuário faz login
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    startAlarmEngine(userId, (item) => {
      const label = item.type === 'tarefa' ? '📋 Tarefa' : '📅 Agenda';
      toast(`⏰ ${label}: ${item.title}${item.time ? ' às ' + item.time : ''}`, 'info', 10000);
    });
    return () => stopAlarmEngine();
  }, [userId]);

  // A conta de Suporte só tem acesso aos Logs — sem isso ela cairia no
  // dashboard e veria "Acesso restrito" logo ao entrar. O perfil continua
  // liberado para ela poder trocar a própria senha.
  useEffect(() => {
    if (profile?.access_level !== 'suporte') return;
    if (page !== 'logs' && page !== 'profile') setPage('logs');
  }, [profile?.access_level, page, setPage]);

  // Espera o perfil antes de montar a tela. Sem isto o app decide permissão
  // com o perfil ainda vazio: todo módulo aparecia como "Acesso restrito" por
  // um instante e liberava sozinho logo depois, sem a pessoa fazer nada.
  if (session === undefined || (session && profile === undefined)) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D0D0D' }}>
      <div style={{ color:'var(--primary)', fontSize:18, fontWeight:700 }}>Carregando...</div>
    </div>
  );

  if (!session) {
    // Se há token na URL, mostrar cadastro direto
    const hasToken = new URLSearchParams(window.location.search).get('token');
    return (
      <div className="auth-page">
        {(authPage === 'register' || hasToken)
          ? <Register onGoLogin={() => { window.history.replaceState({}, '', '/'); setAuthPage('login'); }} />
          : <Login onGoRegister={() => setAuthPage('register')} />}
      </div>
    );
  }

  // Perfil não veio, mesmo com a sessão válida (queda de rede, cadastro
  // removido). Antes o app seguia em frente e mostrava "Acesso restrito" em
  // todos os módulos, o que parece defeito do app em vez de falha ao carregar.
  if (!profile) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:14, padding:24, textAlign:'center', background:'#0D0D0D' }}>
      <span style={{ fontSize:38 }}>⚠️</span>
      <h2 style={{ color:'#fff', fontSize:18, fontWeight:700 }}>Não foi possível carregar seu perfil</h2>
      <p style={{ color:'#999', fontSize:13.5, maxWidth:340, lineHeight:1.6 }}>
        Verifique sua conexão e tente de novo. Se continuar assim, fale com o suporte.
      </p>
      <div style={{ display:'flex', gap:10, marginTop:4 }}>
        <button className="btn btn-primary" onClick={() => loadProfile(session.user.id)}>Tentar de novo</button>
        <button className="btn btn-ghost" onClick={signOut}>Sair</button>
      </div>
    </div>
  );

  const isMaster = profile?.access_level === 'master';

  const setViewingStoreAndSave = (name) => {
    setViewingStore(name);
    localStorage.setItem('master_viewing_store', name);
  };

  // Perfil efetivo: master visualiza dados como se fosse admin da loja selecionada
  const effectiveProfile = isMaster && viewingStore
    ? { ...profile, company: viewingStore, access_level: 'admin' }
    : profile;
  const userSector = effectiveProfile?.sector || '';

  // Termos de uso: exige aceite se ainda não aceitou
  if (profile && !profile.aceite_termos_em) {
    return (
      <div className="auth-page">
        <AceiteTermos userId={userId} onAceito={() => window.location.reload()} />
      </div>
    );
  }

  // Mostra boas-vindas na primeira vez (checa localStorage como fallback)
  const welcomeDone = localStorage.getItem(`welcome_done_${userId}`);
  if (profile?.first_access && !welcomeDone) {
    return (
      <Welcome userId={userId} onFinish={() => window.location.reload()} />
    );
  }

  // Gerente Geral sem loja cadastrada → tela de cadastro
  if (profile?.access_level === 'admin' && !profile?.company) {
    return (
      <React.Suspense fallback={null}>
        <StoreSetup userId={userId} />
      </React.Suspense>
    );
  }

  const has = (key) => hasPermission(profile, key);

  const pages = {
    dashboard:    () => has('dashboard')  ? <Dashboard setPage={setPage} profile={effectiveProfile} />            : <AccessDenied />,
    leaders:      () => <Leaders setPage={setPage} />,
    agenda:       () => has('agenda')     ? <Agenda setPage={setPage} userId={userId} profile={effectiveProfile} /> : <AccessDenied />,
    listas:       () => has('listas')     ? <Listas userId={userId} /> : <AccessDenied />,
    anotacoes:    () => has('anotacoes')  ? <Anotacoes userId={userId} /> : <AccessDenied />,
    atas:         () => has('atas')       ? <AtaReuniao userId={userId} profile={effectiveProfile} /> : <AccessDenied />,
    scale:        () => <Scale setPage={setPage} />,
    team:         () => <TeamMembers userId={userId} userSector={userSector} />,
    nscale:       () => has('escala')     ? <NativeSchedule userId={userId} profile={effectiveProfile} />           : <AccessDenied />,
    cashier:      () => has('caixas')     ? <CashierAnalysis userId={userId} profile={effectiveProfile} />        : <AccessDenied />,
    profile:      () => <Profile />,
    comunicados:  () => <Comunicados userId={userId} profile={effectiveProfile} />,
    tarefas:      () => has('tarefas')    ? <Tarefas userId={userId} profile={effectiveProfile} setPage={setPage} /> : <AccessDenied />,
    mural:        () => has('mural')      ? <Mural userId={userId} profile={effectiveProfile} />                    : <AccessDenied />,
    diario:       () => has('diario')     ? <DiarioBordo userId={userId} profile={effectiveProfile} />              : <AccessDenied />,
    chat:         () => has('chat')       ? <Chat userId={userId} />                                                : <AccessDenied />,
    campanhas:    () => has('campanhas')  ? <Campanhas userId={userId} profile={effectiveProfile} />                : <AccessDenied />,
    relatorios:        () => has('relatorios')        ? <RelatoriosFotograficos userId={userId} profile={effectiveProfile} /> : <AccessDenied />,
    conferencia_secao: () => has('conferencia_secao') ? <ConferenciaSecao userId={userId} profile={effectiveProfile} />      : <AccessDenied />,
    vendas_gestao:() => has('vendas_gestao') ? <GestaoVendas userId={userId} profile={effectiveProfile} />           : <AccessDenied />,
    vendas_painel:() => has('vendas_painel') ? <PainelVendas userId={userId} profile={effectiveProfile} />           : <AccessDenied />,
    usersadmin:   () => has('usuarios')      ? <UsersAdmin userId={userId} profile={effectiveProfile} />             : <AccessDenied />,
    lojas:        () => has('lojas')         ? <MasterDashboard userId={userId} viewingStore={viewingStore} onSelectStore={(name) => { setViewingStoreAndSave(name); setPage('dashboard'); }} /> : <AccessDenied />,
    estoque:          () => has('estoque')          ? <Estoque profile={effectiveProfile} />           : <AccessDenied />,
    importador_estoque: () => has('importador_estoque') ? <ImportadorEstoque profile={effectiveProfile} /> : <AccessDenied />,
    organograma:        () => has('organograma')        ? <Organograma userId={userId} profile={effectiveProfile} /> : <AccessDenied />,
    pdca:               () => has('pdca')               ? <PlanoAcao userId={userId} profile={effectiveProfile} setPage={setPage} /> : <AccessDenied />,
    produtividade:      () => has('produtividade')       ? <Produtividade userId={userId} profile={effectiveProfile} setPage={setPage} /> : <AccessDenied />,
    logs:               () => has('logs')               ? <LogsAuditoria userId={userId} profile={effectiveProfile} /> : <AccessDenied />,
  };

  // CHAMA a função em vez de usá-la como componente.
  //
  // Antes era `<PageComponent />`, com PageComponent vindo do objeto acima.
  // Esse objeto é recriado a cada desenho da tela, então a função era nova
  // toda vez — e para o React, componente novo significa começar do zero.
  // Resultado: abrir o menu no celular, o app renovar a sessão ou girar a
  // tela apagava tudo o que a pessoa tinha digitado numa ata, num relato ou
  // numa tarefa. Chamando a função, o que chega ao React é sempre o mesmo
  // componente, e o preenchimento sobrevive.
  const paginaAtual = (pages[page] || pages.dashboard)();

  const handleNavMobile = (p) => { setPage(p); setMobileMenuOpen(false); };

  return (
    <div className="layout">
      {/* Botão hamburguer — só no mobile */}
      {isMobile && (
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 400,
            width: 42, height: 42, borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 5, cursor: 'pointer', padding: 0,
          }}
          aria-label="Menu"
        >
          <span style={{ display:'block', width:18, height:2, background:'var(--text)', borderRadius:2, transition:'all .2s',
            transform: mobileMenuOpen ? 'rotate(45deg) translate(4px,4px)' : 'none' }}/>
          <span style={{ display:'block', width:18, height:2, background:'var(--text)', borderRadius:2, transition:'all .2s',
            opacity: mobileMenuOpen ? 0 : 1 }}/>
          <span style={{ display:'block', width:18, height:2, background:'var(--text)', borderRadius:2, transition:'all .2s',
            transform: mobileMenuOpen ? 'rotate(-45deg) translate(4px,-4px)' : 'none' }}/>
        </button>
      )}

      {/* Overlay escuro quando drawer aberto */}
      {isMobile && mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:250, backdropFilter:'blur(2px)' }}
        />
      )}

      <Sidebar
        page={page}
        setPage={isMobile ? handleNavMobile : setPage}
        width={isMobile ? undefined : sidebarW}
        sidebarRef={isMobile ? undefined : sidebarRef}
        mobileOpen={mobileMenuOpen}
        isMobile={isMobile}
      />

      {/* Divisor arrastável — só no desktop */}
      {!isMobile && (
        <div
          ref={handleRef}
          onMouseDown={onMouseDown}
          title="Arraste para redimensionar o menu"
          style={{
            position: 'fixed', top: 0, bottom: 0,
            left: sidebarW - 3, width: 6,
            cursor: 'col-resize', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ width:3, height:'100%', background:'transparent', transition:'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          />
        </div>
      )}

      {swUpdate && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: 'var(--primary)', color: '#fff',
          borderRadius: 12, padding: '12px 20px', display: 'flex', gap: 12,
          alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,.4)', fontSize: 13,
          whiteSpace: 'nowrap',
        }}>
          {/* O número aqui era fixo no código e nunca mudava, então mostrava
              a mesma versão para sempre — e atrapalhou o diagnóstico do push,
              porque parecia ser a versão real do aparelho. */}
          <span>Nova versão disponível — {VERSAO_ESPERADA}</span>
          <button
            onClick={() => { if ('caches' in window) { caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => window.location.reload()); } else { window.location.reload(); } }}
            style={{ background: '#fff', color: 'var(--primary)', border: 'none',
              borderRadius: 8, padding: '4px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
          >
            Atualizar agora
          </button>
        </div>
      )}

      <main
        ref={isMobile ? undefined : mainRef}
        className="main-content"
        style={isMobile ? { marginLeft: 0 } : { marginLeft: sidebarW }}
      >
        {/* Banner de visualização de loja — só para master */}
        {isMaster && viewingStore && (
          <div style={{
            background: 'var(--primary)', color: '#fff',
            padding: '10px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', fontSize: 13, fontWeight: 600,
            gap: 12, flexShrink: 0,
          }}>
            <span>👁 Visualizando: <strong>{viewingStore}</strong></span>
            <button
              onClick={() => { setViewingStoreAndSave(''); setPage('lojas'); }}
              style={{
                background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)',
                color: '#fff', borderRadius: 8, padding: '3px 12px',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}
            >
              ✕ Sair da loja
            </button>
          </div>
        )}

        <React.Suspense fallback={
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            minHeight:'60vh', color:'var(--text-muted)', fontSize:14 }}>
            Carregando...
          </div>
        }>
          <ErrorBoundary key={page} userId={userId}>
            {paginaAtual}
          </ErrorBoundary>
        </React.Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
