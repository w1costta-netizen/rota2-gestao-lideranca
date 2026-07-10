import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Leaders from './pages/Leaders';
import Agenda from './pages/Agenda';
import Scale from './pages/Scale';
import Profile from './pages/Profile';
import CashierAnalysis from './pages/CashierAnalysis';
import Login from './pages/Login';
import Register from './pages/Register';

function AppContent() {
  const { session } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [authPage, setAuthPage] = useState('login');

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f2444, #2563eb)' }}>
      <div style={{ color: 'white', fontSize: 18, fontWeight: 600 }}>Carregando...</div>
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
  const Page = { dashboard: Dashboard, leaders: Leaders, agenda: Agenda, scale: Scale, cashier: () => <CashierAnalysis userId={userId} />, profile: Profile }[page];

  return (
    <div className="layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">
        <Page setPage={setPage} />
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
