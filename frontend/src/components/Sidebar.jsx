import React from 'react';
import { Users, CalendarDays, LayoutGrid, LogOut, UserCircle, ShoppingCart, CalendarRange, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../lib/permissions';

const NAV_ALL = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutGrid,   perm: 'dashboard' },
  { id: 'agenda',     label: 'Agenda',     icon: CalendarDays, perm: 'agenda' },
  { id: 'nscale',     label: 'Escala',     icon: CalendarRange,perm: 'escala' },
  { id: 'cashier',    label: 'Caixas',     icon: ShoppingCart, perm: 'caixas' },
  { id: 'profile',    label: 'Meu Perfil', icon: UserCircle,   perm: null }, // sempre visível
  { id: 'usersadmin', label: 'Usuários',   icon: ShieldCheck,  perm: 'usuarios' },
];

export default function Sidebar({ page, setPage, width, sidebarRef, mobileOpen, isMobile }) {
  const { profile, signOut } = useAuth();
  const NAV = NAV_ALL.filter(n => n.perm === null || hasPermission(profile, n.perm));
  const initials = profile?.full_name?.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatarUrl = profile?.avatar_url;
  const collapsed = !isMobile && width !== undefined && width < 100;

  const mobileStyle = isMobile ? {
    width: 260,
    transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform .25s ease',
    zIndex: 300,
  } : (width ? { width } : undefined);

  return (
    <aside ref={sidebarRef} className="sidebar" style={mobileStyle}>
      <div className="sidebar-logo" style={collapsed ? { padding:'16px 8px', textAlign:'center' } : undefined}>
        {!collapsed && <h1>Rota 2.0</h1>}
        {!collapsed && <p>Gestão de Liderança</p>}
        {collapsed && <h1 style={{ fontSize:12, margin:0 }}>R2</h1>}
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${page === id ? ' active' : ''}`}
            onClick={() => setPage(id)}
            title={collapsed ? label : undefined}
            style={collapsed ? { justifyContent:'center', padding:'12px 0' } : undefined}
          >
            <Icon size={18} />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>

      <div className="user-menu" style={collapsed ? { flexDirection:'column', gap:6, padding:'12px 8px', alignItems:'center' } : undefined}>
        <div
          className="user-avatar"
          style={{ cursor:'pointer', overflow:'hidden', padding: avatarUrl ? 0 : undefined, flexShrink:0 }}
          onClick={() => setPage('profile')}
          title={collapsed ? (profile?.full_name || 'Ver perfil') : 'Ver perfil'}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }}/>
            : initials}
        </div>
        {!collapsed && (
          <div className="user-info">
            <div className="user-name">{profile?.full_name || 'Usuário'}</div>
            <div className="user-role">{profile?.sector || profile?.company || ''}</div>
          </div>
        )}
        <button className="btn-icon" onClick={signOut} title="Sair" style={{ color:'rgba(255,255,255,.5)', flexShrink:0 }}>
          <LogOut size={16}/>
        </button>
      </div>
    </aside>
  );
}
