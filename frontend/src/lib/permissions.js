export const MODULES = [
  { key: 'dashboard',      label: 'Dashboard',         icon: '📊', desc: 'Visão geral e indicadores' },
  { key: 'agenda',         label: 'Agenda',            icon: '📅', desc: 'Calendário de eventos' },
  { key: 'escala',         label: 'Escala',            icon: '📋', desc: 'Ver e gerenciar a própria escala' },
  { key: 'escala_setores', label: 'Escala — Setores',  icon: '🗂️', desc: 'Visualizar escalas de outros setores' },
  { key: 'caixas',         label: 'Caixas',            icon: '💳', desc: 'Análise de desempenho de caixas' },
  { key: 'usuarios',       label: 'Usuários',          icon: '👥', desc: 'Criar e gerenciar usuários da empresa' },
];

export const DEFAULT_PERMISSIONS = {
  admin:      ['dashboard', 'agenda', 'escala', 'escala_setores', 'caixas', 'usuarios'],
  supervisor: ['dashboard', 'agenda', 'escala', 'escala_setores', 'caixas'],
  lider:      ['dashboard', 'agenda', 'escala', 'caixas'],
};

export function getEffectivePermissions(profile) {
  if (profile?.permissions?.length) return profile.permissions;
  return DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
}

export function hasPermission(profile, key) {
  return getEffectivePermissions(profile).includes(key);
}
