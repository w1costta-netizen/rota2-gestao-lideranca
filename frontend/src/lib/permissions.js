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
  { key: 'relatorios',     label: 'Relatórios Fotográficos',icon: '📷', desc: 'Criar e compartilhar relatórios com fotos anotadas' },
  { key: 'usuarios',       label: 'Usuários',               icon: '👥', desc: 'Criar e gerenciar usuários da empresa' },
];

export const DEFAULT_PERMISSIONS = {
  admin:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'usuarios'],
  supervisor:   ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios'],
  lider:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'caixas', 'relatorios'],
  colaborador:  ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas'],
};

export function getEffectivePermissions(profile) {
  if (profile?.permissions?.length) return profile.permissions;
  return DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
}

export function hasPermission(profile, key) {
  return getEffectivePermissions(profile).includes(key);
}
