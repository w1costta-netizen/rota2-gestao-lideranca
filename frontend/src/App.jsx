import React, { useState } from 'react';
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

function AppContent() {
  const { session, profile } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [authPage, setAuthPage] = useState('login');

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
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">
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
