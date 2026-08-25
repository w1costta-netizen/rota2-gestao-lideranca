export const MODULES = [
  { key: 'dashboard',      label: 'Dashboard',             icon: '📊', desc: 'Visão geral e indicadores' },
  { key: 'comunicados',    label: 'Comunicados',            icon: '📢', desc: 'Avisos e comunicados do gestor' },
  { key: 'tarefas',        label: 'Tarefas',                icon: '✅', desc: 'Tarefas atribuídas' },
  { key: 'mural',          label: 'Mural do Time',          icon: '📌', desc: 'Metas, regras e lembretes' },
  { key: 'agenda',         label: 'Agenda',                 icon: '📅', desc: 'Calendário de eventos' },
  { key: 'listas',         label: 'Listas',                 icon: '📝', desc: 'Listas pessoais para anotar e lembrar' },
  { key: 'atas',           label: 'Ata de Reunião',         icon: '🖋️', desc: 'Criar e assinar atas de reunião' },
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
  { key: 'produtividade',       label: 'Gestão do Tempo e Produtividade', icon: '⏱️', desc: 'Treinamentos de produtividade e painel de acompanhamento do time' },
  { key: 'logs',                 label: 'Logs de Auditoria',      icon: '🛡️', desc: 'Histórico de ações administrativas e falhas do sistema' },
];

export const DEFAULT_PERMISSIONS = {
  master:       ['lojas', 'dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'listas', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade', 'logs'],
  admin:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'listas', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade', 'logs'],
  supervisor:   ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'listas', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade'],
  lider:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'agenda', 'listas', 'atas', 'escala', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade'],
  colaborador:  ['dashboard', 'comunicados', 'tarefas', 'mural', 'campanhas', 'listas', 'atas', 'produtividade'],
};

// Módulos premium: exigem que a loja tenha contratado o módulo além da
// permissão de cargo. Controlado pelo master em "Gestão de Lojas".
export const PREMIUM_MODULES = ['vendas_gestao', 'vendas_painel', 'estoque', 'importador_estoque', 'conferencia_secao', 'campanhas'];

export function getEffectivePermissions(profile) {
  if (profile?.access_level === 'master') return DEFAULT_PERMISSIONS.master;
  if (profile?.permissions?.length) return profile.permissions;
  return DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
}

export function hasPermission(profile, key) {
  if (!getEffectivePermissions(profile).includes(key)) return false;
  if (profile?.access_level === 'master') return true;
  if (PREMIUM_MODULES.includes(key)) {
    return (profile?.modulos_premium || []).includes(key);
  }
  return true;
}
