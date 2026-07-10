import React from 'react';
import { Users, CalendarDays, LayoutGrid, ClipboardList, LogOut, UserCircle, ShoppingCart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutGrid },
  { id: 'leaders',   label: 'Líderes',    icon: Users },
  { id: 'agenda',    label: 'Agenda',     icon: CalendarDays },
  { id: 'scale',     label: 'Escala',     icon: ClipboardList },
  { id: 'cashier',   label: 'Caixas',     icon: ShoppingCart },
  { id: 'profile',   label: 'Meu Perfil', icon: UserCircle },
];

export default function Sidebar({ page, setPage }) {
  const { profile, signOut } = useAuth();
  const initials = profile?.full_name?.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatarUrl = profile?.avatar_url;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Rota 2.0</h1>
        <p>Gestão de Liderança</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${page === id ? ' active' : ''}`}
            onClick={() => setPage(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="user-menu">
        <div
          className="user-avatar"
          style={{ cursor:'pointer', overflow:'hidden', padding: avatarUrl ? 0 : undefined }}
          onClick={() => setPage('profile')}
          title="Ver perfil"
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }}/>
            : initials}
        </div>
        <div className="user-info">
          <div className="user-name">{profile?.full_name || 'Usuário'}</div>
          <div className="user-role">{profile?.company || profile?.role || ''}</div>
        </div>
        <button className="btn-icon" onClick={signOut} title="Sair" style={{ color:'rgba(255,255,255,.5)' }}>
          <LogOut size={16}/>
        </button>
      </div>
    </aside>
  );
}
