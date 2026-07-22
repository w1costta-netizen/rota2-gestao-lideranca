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
  { key: 'usuarios',       label: 'Usuários',               icon: '👥', desc: 'Criar e gerenciar usuários da empresa' },
];

export const DEFAULT_PERMISSIONS = {
  admin:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios'],
  supervisor:   ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_painel'],
  lider:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'escala', 'caixas', 'relatorios', 'vendas_painel'],
  colaborador:  ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas'],
};

export function getEffectivePermissions(profile) {
  if (profile?.permissions?.length) return profile.permissions;
  return DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
}

export function hasPermission(profile, key) {
  return getEffectivePermissions(profile).includes(key);
}
