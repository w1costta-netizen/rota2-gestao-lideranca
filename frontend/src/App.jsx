import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Leaders from './pages/Leaders';
import Agenda from './pages/Agenda';
import Scale from './pages/Scale';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import CashierAnalysis from './pages/CashierAnalysis';
import TeamMembers from './pages/TeamMembers';
import NativeSchedule from './pages/NativeSchedule';

const SIDEBAR_MIN = 60;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 240;

function AppContent() {
  const { session, profile } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [authPage, setAuthPage] = useState('login');
  const [sidebarW, setSidebarW] = useState(
    () => parseInt(localStorage.getItem('sidebarWidth') || SIDEBAR_DEFAULT)
  );
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sidebarW;
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarW]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + e.clientX - startX.current));
      setSidebarW(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      setSidebarW(w => { localStorage.setItem('sidebarWidth', w); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
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

  const pages = {
    dashboard: () => <Dashboard setPage={setPage} />,
    leaders:   () => <Leaders setPage={setPage} />,
    agenda:    () => <Agenda setPage={setPage} />,
    scale:     () => <Scale setPage={setPage} />,
    team:      () => <TeamMembers userId={userId} userSector={userSector} />,
    nscale:    () => <NativeSchedule userId={userId} profile={profile} />,
    cashier:   () => <CashierAnalysis userId={userId} />,
    profile:   () => <Profile />,
  };

  const PageComponent = pages[page] || pages.dashboard;

  return (
    <div className="layout">
      <Sidebar page={page} setPage={setPage} width={sidebarW} />

      {/* Divisor arrastável */}
      <div
        onMouseDown={onMouseDown}
        title="Arraste para redimensionar"
        style={{
          position: 'fixed',
          top: 0, bottom: 0,
          left: sidebarW - 3,
          width: 6,
          cursor: 'col-resize',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Alça visual */}
        <div style={{
          width: 3,
          height: '100%',
          background: 'transparent',
          transition: 'background .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />
      </div>

      <main className="main-content" style={{ marginLeft: sidebarW }}>
        <PageComponent />
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
