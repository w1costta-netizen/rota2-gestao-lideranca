import React, { useState } from 'react';
import { CalendarDays, LayoutGrid, LogOut, UserCircle, ShoppingCart, CalendarRange, ShieldCheck, Megaphone, CheckSquare, LayoutList, Tag, Camera, BarChart2, FolderOpen, Store, Package, PackagePlus, GitBranch, ChevronDown, ChevronRight, MessageSquare, Clock, Briefcase, TrendingUp, ClipboardCheck, Sun, Moon, Navigation, Target, Shield, GraduationCap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../lib/permissions';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';

// Itens avulsos (sem grupo)
const NAV_SOLO = [
  { id: 'lojas',            label: 'Lojas',           icon: Store,       perm: 'lojas' },
  { id: 'dashboard',        label: 'Dashboard',       icon: LayoutGrid,  perm: 'dashboard' },
  { id: 'campanhas',        label: 'Flyers',           icon: Tag,         perm: 'campanhas' },
  { id: 'relatorios',       label: 'Tour 4x4',         icon: Camera,      perm: 'relatorios' },
  { id: 'vendas_gestao',    label: 'Gest. Vendas',     icon: FolderOpen,  perm: 'vendas_gestao' },
  { id: 'vendas_painel',    label: 'Painel Vendas',    icon: BarChart2,   perm: 'vendas_painel' },
  { id: 'estoque',          label: 'Estoque',          icon: Package,     perm: 'estoque' },
  { id: 'importador_estoque', label: 'Import. Estoque', icon: PackagePlus, perm: 'importador_estoque' },
  { id: 'nscale',           label: 'Escala',           icon: CalendarRange, perm: 'escala' },
  { id: 'cashier',          label: 'Caixas',           icon: ShoppingCart, perm: 'caixas' },
  { id: 'organograma',      label: 'Organograma',      icon: GitBranch,   perm: 'organograma' },
  { id: 'usersadmin',       label: 'Usuários',         icon: ShieldCheck, perm: 'usuarios' },
  { id: 'profile',          label: 'Meu Perfil',       icon: UserCircle,  perm: null },
];

// Grupos colapsáveis
const NAV_GROUPS = [
  {
    id:    'comunicacao',
    label: 'Comunicação',
    icon:  MessageSquare,
    items: [
      { id: 'comunicados', label: 'Comunicados', icon: Megaphone,   perm: 'comunicados' },
      { id: 'mural',       label: 'Mural',       icon: LayoutList,  perm: 'mural' },
    ],
  },
  {
    id:    'tempo_produtividade',
    label: 'Gestão do Tempo e Produtividade',
    icon:  Clock,
    items: [
      { id: 'tarefas', label: 'Tarefas',       icon: CheckSquare,  perm: 'tarefas' },
      { id: 'agenda',  label: 'Agenda',        icon: CalendarDays, perm: 'agenda' },
      { id: 'pdca',    label: 'Plano de Ação', icon: Target,       perm: 'pdca' },
      { id: 'produtividade', label: 'Produtividade', icon: GraduationCap, perm: 'produtividade' },
    ],
  },
  {
    id:    'vendas',
    label: 'Vendas',
    icon:  TrendingUp,
    items: [
      { id: 'vendas_gestao', label: 'Gestão de Vendas', icon: FolderOpen, perm: 'vendas_gestao' },
      { id: 'vendas_painel', label: 'Painel de Vendas', icon: BarChart2,  perm: 'vendas_painel' },
    ],
  },
  {
    id:    'estoque_grupo',
    label: 'Estoque',
    icon:  Package,
    items: [
      { id: 'estoque',           label: 'Estoque',         icon: Package,    perm: 'estoque' },
      { id: 'importador_estoque',label: 'Importar Estoque',icon: PackagePlus,perm: 'importador_estoque' },
    ],
  },
  {
    id:    'operacoes',
    label: 'Operações',
    icon:  Briefcase,
    items: [
      { id: 'nscale',            label: 'Escala',               icon: CalendarRange, perm: 'escala' },
      { id: 'cashier',           label: 'Caixas',               icon: ShoppingCart,  perm: 'caixas' },
      { id: 'relatorios',        label: 'Tour 4x4',             icon: Camera,        perm: 'relatorios' },
      { id: 'campanhas',         label: 'Flyers',               icon: Tag,           perm: 'campanhas' },
      { id: 'conferencia_secao', label: 'Conferência de Seção', icon: ClipboardCheck, perm: 'conferencia_secao' },
    ],
  },
  {
    id:    'equipe',
    label: 'Equipe',
    icon:  UserCircle,
    items: [
      { id: 'usersadmin',  label: 'Usuários',    icon: ShieldCheck, perm: 'usuarios' },
      { id: 'profile',     label: 'Meu Perfil',  icon: UserCircle,  perm: null },
      { id: 'organograma', label: 'Organograma', icon: GitBranch,   perm: 'organograma' },
      { id: 'logs',        label: 'Logs de Auditoria', icon: Shield, perm: 'logs' },
    ],
  },
];

// Ordem final na sidebar: solos intercalados com grupos na posição certa
// dashboard → grupos → resto
const SOLO_BEFORE = ['lojas', 'dashboard'];
const SOLO_AFTER  = [];

export default function Sidebar({ page, setPage, width, sidebarRef, mobileOpen, isMobile }) {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const collapsed = !isMobile && width !== undefined && width < 100;

  // Abre automaticamente o grupo que contém a página ativa
  const activeGroup = NAV_GROUPS.find(g => g.items.some(i => i.id === page))?.id || null;
  const [openGroups, setOpenGroups] = useState(() => activeGroup ? { [activeGroup]: true } : {});

  const toggleGroup = (id) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const has  = (perm) => perm === null || hasPermission(profile, perm);
  const isActive = (id) => page === id;

  const renderItem = ({ id, label, icon: Icon }, indent = false) => (
    <button
      key={id}
      className={`nav-item${isActive(id) ? ' active' : ''}`}
      onClick={() => setPage(id)}
      title={collapsed ? label : undefined}
      style={{
        ...(collapsed ? { justifyContent:'center', padding:'12px 0' } : {}),
        ...(indent && !collapsed ? { paddingLeft: 28 } : {}),
      }}
    >
      <Icon size={indent ? 15 : 18} style={indent ? { opacity: 0.85 } : {}}/>
      {!collapsed && <span style={indent ? { fontSize: 13 } : {}}>{label}</span>}
    </button>
  );

  const renderGroup = ({ id, label, icon: Icon, items }) => {
    const visibleItems = items.filter(i => has(i.perm));
    if (visibleItems.length === 0) return null;
    const open = !!openGroups[id];
    const groupActive = visibleItems.some(i => isActive(i.id));

    return (
      <div key={id}>
        {/* Cabeçalho do grupo */}
        <button
          className={`nav-item${groupActive && !open ? ' active' : ''}`}
          onClick={() => toggleGroup(id)}
          title={collapsed ? label : undefined}
          style={{
            ...(collapsed ? { justifyContent:'center', padding:'12px 0' } : {}),
            width: '100%',
          }}
        >
          <Icon size={18} style={{ flexShrink: 0 }}/>
          {!collapsed && (
            <>
              <span style={{ flex: 1, textAlign:'left' }}>{label}</span>
              {open
                ? <ChevronDown size={14} style={{ opacity:.6, flexShrink:0 }}/>
                : <ChevronRight size={14} style={{ opacity:.6, flexShrink:0 }}/>}
            </>
          )}
        </button>

        {/* Itens filhos */}
        {open && !collapsed && (
          <div style={{
            borderLeft: '2px solid rgba(232,98,42,0.35)',
            marginLeft: 18,
            marginBottom: 4,
          }}>
            {visibleItems.map(item => renderItem(item, true))}
          </div>
        )}
        {/* Modo collapsed: mostra filhos direto sem indent */}
        {collapsed && visibleItems.map(item => renderItem(item, false))}
      </div>
    );
  };

  const initials  = profile?.full_name?.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatarUrl = profile?.avatar_url;

  const mobileStyle = isMobile ? {
    width: 260,
    transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform .25s ease',
    zIndex: 300,
  } : (width ? { width } : undefined);

  const soloVisible = (ids) => NAV_SOLO.filter(n => ids.includes(n.id) && has(n.perm));

  return (
    <aside ref={sidebarRef} className="sidebar" style={mobileStyle}>
      <div className="sidebar-logo" style={collapsed ? { padding:'16px 8px', justifyContent:'center', flexDirection:'column', gap:4 } : undefined}>
        <div className="sidebar-logo-icon" style={collapsed ? { width:26, height:26 } : undefined}>
          <Navigation size={collapsed ? 14 : 16} color="white" />
        </div>
        {!collapsed && (
          <div>
            <h1>Rota Líder</h1>
            <p>Gestão, Liderança e Produtividade</p>
          </div>
        )}
        {collapsed && <span style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.5px' }}>RL</span>}
      </div>

      <nav className="sidebar-nav">
        {/* Itens antes dos grupos: Lojas, Dashboard */}
        {soloVisible(SOLO_BEFORE).map(n => renderItem(n))}

        {/* Grupos colapsáveis */}
        {NAV_GROUPS.map(g => renderGroup(g))}

        {/* Demais itens */}
        {soloVisible(SOLO_AFTER).map(n => renderItem(n))}
      </nav>

      <div className="user-menu" style={collapsed ? { flexDirection:'column', gap:6, padding:'12px 8px', alignItems:'center' } : undefined}>
        <Avatar
          name={profile?.full_name}
          avatarUrl={avatarUrl}
          size={32}
          style={{ cursor:'pointer', border:'2px solid rgba(238,90,36,.35)' }}
          onClick={() => setPage('profile')}
          title={collapsed ? (profile?.full_name || 'Ver perfil') : 'Ver perfil'}
        />
        {!collapsed && (
          <div className="user-info">
            <div className="user-name">{profile?.full_name || 'Usuário'}</div>
            <div className="user-role">{profile?.sector || profile?.company || ''}</div>
          </div>
        )}
        <button
          className="btn-icon"
          onClick={toggle}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          style={{ color:'rgba(240,237,245,.5)', flexShrink:0 }}
        >
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
        <button className="btn-icon" onClick={signOut} title="Sair" style={{ color:'rgba(240,237,245,.5)', flexShrink:0 }}>
          <LogOut size={16}/>
        </button>
      </div>
      {!collapsed && (
        <div style={{ padding:'8px 16px 12px', textAlign:'center' }}>
          <a href="/termos-de-uso-rotalider.html" target="_blank" rel="noopener noreferrer"
            style={{ fontSize:10, color:'rgba(255,255,255,.3)', textDecoration:'underline' }}>
            Termos de Uso
          </a>
          {' · '}
          <a href="/politica-de-privacidade-rotalider.html" target="_blank" rel="noopener noreferrer"
            style={{ fontSize:10, color:'rgba(255,255,255,.3)', textDecoration:'underline' }}>
            Privacidade
          </a>
        </div>
      )}
    </aside>
  );
}
