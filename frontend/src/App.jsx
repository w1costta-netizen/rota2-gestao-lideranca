import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { hasPermission } from './lib/permissions';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';

// Lazy-load de todas as páginas — reduz o bundle inicial em ~70%
const lazy = (fn) => React.lazy(fn);
const Dashboard              = lazy(() => import('./pages/Dashboard'));
const Leaders                = lazy(() => import('./pages/Leaders'));
const Agenda                 = lazy(() => import('./pages/Agenda'));
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
const GestaoVendas           = lazy(() => import('./pages/GestaoVendas'));
const PainelVendas           = lazy(() => import('./pages/PainelVendas'));

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
  const { session, profile } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [authPage, setAuthPage] = useState('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    }).catch(() => {});

    const handler = (e) => {
      if (e.data?.type === 'NAVIGATE') setPage(e.data.page || 'dashboard');
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  if (session === undefined) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0D0D0D' }}>
      <div style={{ color:'var(--primary)', fontSize:18, fontWeight:700 }}>Carregando...</div>
    </div>
  );

  if (!session) return (
    <div className="auth-page">
      {authPage === 'login'
        ? <Login onGoRegister={() => setAuthPage('register')} />
        : <Register onGoLogin={() => setAuthPage('login')} />}
    </div>
  );

  const userId = session?.user?.id;
  const userSector = profile?.sector || '';

  // Mostra boas-vindas na primeira vez (checa localStorage como fallback)
  const welcomeDone = localStorage.getItem(`welcome_done_${userId}`);
  if (profile?.first_access && !welcomeDone) {
    return (
      <Welcome userId={userId} onFinish={() => window.location.reload()} />
    );
  }

  const has = (key) => hasPermission(profile, key);

  const pages = {
    dashboard:    () => has('dashboard')  ? <Dashboard setPage={setPage} />                              : <AccessDenied />,
    leaders:      () => <Leaders setPage={setPage} />,
    agenda:       () => has('agenda')     ? <Agenda setPage={setPage} userId={userId} profile={profile} /> : <AccessDenied />,
    scale:        () => <Scale setPage={setPage} />,
    team:         () => <TeamMembers userId={userId} userSector={userSector} />,
    nscale:       () => has('escala')     ? <NativeSchedule userId={userId} profile={profile} />          : <AccessDenied />,
    cashier:      () => has('caixas')     ? <CashierAnalysis userId={userId} />                           : <AccessDenied />,
    profile:      () => <Profile />,
    comunicados:  () => <Comunicados userId={userId} profile={profile} />,
    tarefas:      () => has('tarefas')    ? <Tarefas userId={userId} profile={profile} />                 : <AccessDenied />,
    mural:        () => has('mural')      ? <Mural userId={userId} profile={profile} />                   : <AccessDenied />,
    campanhas:    () => has('campanhas')  ? <Campanhas userId={userId} profile={profile} />               : <AccessDenied />,
    relatorios:   () => has('relatorios')     ? <RelatoriosFotograficos userId={userId} profile={profile} /> : <AccessDenied />,
    vendas_gestao:() => has('vendas_gestao') ? <GestaoVendas userId={userId} profile={profile} />           : <AccessDenied />,
    vendas_painel:() => has('vendas_painel') ? <PainelVendas userId={userId} profile={profile} />           : <AccessDenied />,
    usersadmin:   () => has('usuarios')      ? <UsersAdmin userId={userId} profile={profile} />             : <AccessDenied />,
  };

  const PageComponent = pages[page] || pages.dashboard;

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
          <span>Nova versão disponível</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#fff', color: 'var(--primary)', border: 'none',
              borderRadius: 8, padding: '4px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
          >
            Atualizar
          </button>
        </div>
      )}

      <main
        ref={isMobile ? undefined : mainRef}
        className="main-content"
        style={isMobile ? { marginLeft: 0 } : { marginLeft: sidebarW }}
      >
        <React.Suspense fallback={
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
            minHeight:'60vh', color:'var(--text-muted)', fontSize:14 }}>
            Carregando...
          </div>
        }>
          <ErrorBoundary key={page}>
            <PageComponent />
          </ErrorBoundary>
        </React.Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
