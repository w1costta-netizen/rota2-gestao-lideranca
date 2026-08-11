export const MODULES = [
  { key: 'dashboard',      label: 'Dashboard',             icon: '📊', desc: 'Visão geral e indicadores' },
  { key: 'comunicados',    label: 'Comunicados',            icon: '📢', desc: 'Avisos e comunicados do gestor' },
  { key: 'tarefas',        label: 'Tarefas',                icon: '✅', desc: 'Tarefas atribuídas' },
  { key: 'mural',          label: 'Mural do Time',          icon: '📌', desc: 'Metas, regras e lembretes' },
  { key: 'agenda',         label: 'Agenda',                 icon: '📅', desc: 'Calendário de eventos' },
  { key: 'escala',         label: 'Escala',                 icon: '📋', desc: 'Ver e gerenciar a própria escala' },
  { key: 'escala_setores', label: 'Escala — Setores',       icon: '🗂️', desc: 'Visualizar escalas de outros setores' },
  { key: 'caixas',         label: 'Caixas',                 icon: '💳', desc: 'Análise de desempenho de caixas' },
  { key: 'campanhas',      label: 'Conferência Flyers',     icon: '🏷️', desc: 'Sinalização e conferência de materiais promocionais' },
  { key: 'relatorios',     label: 'Tour 4x4',               icon: '📷', desc: 'Criar e compartilhar tours com fotos anotadas' },
  { key: 'vendas_gestao', label: 'Gestão de Vendas',       icon: '📂', desc: 'Importar planilhas e fechar mês de vendas' },
  { key: 'vendas_painel', label: 'Painel de Vendas',       icon: '📈', desc: 'Acompanhar metas e resultados de vendas' },
  { key: 'usuarios',             label: 'Usuários',               icon: '👥', desc: 'Criar e gerenciar usuários da empresa' },
  { key: 'estoque',             label: 'Estoque',                icon: '📦', desc: 'Visualizar e gerenciar estoque' },
  { key: 'importador_estoque',  label: 'Importador de Estoque',  icon: '📥', desc: 'Importar planilhas de estoque' },
  { key: 'organograma',         label: 'Organograma',            icon: '🌿', desc: 'Hierarquia de equipes e líderes' },
  { key: 'conferencia_secao',   label: 'Conferência de Seção',   icon: '🔍', desc: 'Conferência e checklist de seções da loja' },
  { key: 'pdca',                label: 'Plano de Ação (PDCA)',   icon: '🎯', desc: 'Criar e acompanhar planos de ação PDCA' },
];

export const DEFAULT_PERMISSIONS = {
  master:       ['lojas', 'dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca'],
  admin:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca'],
  supervisor:   ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca'],
  lider:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca'],
  colaborador:  ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas'],
};

export function getEffectivePermissions(profile) {
  if (profile?.access_level === 'master') return DEFAULT_PERMISSIONS.master;
  if (profile?.permissions?.length) return profile.permissions;
  return DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
}

export function hasPermission(profile, key) {
  return getEffectivePermissions(profile).includes(key);
}
