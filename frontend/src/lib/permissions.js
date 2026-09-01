export const MODULES = [
  { key: 'dashboard',      label: 'Dashboard',             icon: '📊', desc: 'Visão geral e indicadores' },
  { key: 'comunicados',    label: 'Comunicados',            icon: '📢', desc: 'Avisos e comunicados do gestor' },
  { key: 'tarefas',        label: 'Tarefas',                icon: '✅', desc: 'Tarefas atribuídas' },
  { key: 'mural',          label: 'Mural do Time',          icon: '📌', desc: 'Metas, regras e lembretes' },
  { key: 'diario',         label: 'Diário de Bordo',        icon: '📖', desc: 'Relatos do dia a dia da loja' },
  { key: 'chat',           label: 'Conversas',              icon: '💬', desc: 'Conversa direta entre pessoas da loja' },
  { key: 'agenda',         label: 'Agenda',                 icon: '📅', desc: 'Calendário de eventos' },
  { key: 'listas',         label: 'Listas',                 icon: '📝', desc: 'Listas pessoais para anotar e lembrar' },
  { key: 'anotacoes',      label: 'Anotações',              icon: '🗒️', desc: 'Anotações pessoais em cartões' },
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
  master:       ['lojas', 'dashboard', 'comunicados', 'tarefas', 'mural', 'diario', 'chat', 'campanhas', 'agenda', 'listas', 'anotacoes', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade', 'logs'],
  admin:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'diario', 'chat', 'campanhas', 'agenda', 'listas', 'anotacoes', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_gestao', 'vendas_painel', 'usuarios', 'estoque', 'importador_estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade', 'logs'],
  supervisor:   ['dashboard', 'comunicados', 'tarefas', 'mural', 'diario', 'chat', 'campanhas', 'agenda', 'listas', 'anotacoes', 'atas', 'escala', 'escala_setores', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade'],
  lider:        ['dashboard', 'comunicados', 'tarefas', 'mural', 'diario', 'chat', 'campanhas', 'agenda', 'listas', 'anotacoes', 'atas', 'escala', 'caixas', 'relatorios', 'vendas_painel', 'estoque', 'organograma', 'conferencia_secao', 'pdca', 'produtividade'],
  // Agenda e escala entram aqui porque são a agenda e a escala DA PRÓPRIA
  // pessoa — quem trabalha no dia precisa saber quando trabalha. Ver a
  // escala de outros setores ('escala_setores') continua fora.
  colaborador:  ['dashboard', 'comunicados', 'tarefas', 'mural', 'diario', 'chat', 'campanhas', 'agenda', 'listas', 'anotacoes', 'atas', 'escala', 'produtividade'],
  // Suporte técnico (Help Desk): enxerga só os Logs de Auditoria, de todas as
  // lojas, para investigar erros. De propósito NÃO tem acesso a tarefas,
  // vendas, estoque, equipe nem qualquer dado de operação dos clientes.
  suporte:      ['logs'],
};

// Módulos premium: exigem que a loja tenha contratado o módulo além da
// permissão de cargo. Controlado pelo master em "Gestão de Lojas".
export const PREMIUM_MODULES = ['vendas_gestao', 'vendas_painel', 'estoque', 'importador_estoque', 'conferencia_secao', 'campanhas'];

// ─── Módulos novos e listas personalizadas ──────────────────────────
//
// Quem tem lista personalizada ficava congelado no dia em que ela foi
// salva: nenhum módulo criado depois aparecia para essa pessoa, e ela ia
// ficando para trás a cada novidade sem ninguém perceber. Só que também
// não dá para simplesmente devolver tudo — um módulo tirado de propósito
// tem que continuar fora.
//
// A diferença entre os dois casos é QUANDO a lista foi salva. Por isso o
// catálogo tem versão: a lista guarda em que versão foi feita, e só os
// módulos que nasceram depois dela entram sozinhos.
//
// Ao criar um módulo novo: suba CATALOGO_VERSAO em 1 e registre a chave
// dele em MODULOS_DA_VERSAO com esse número. Só isso.
export const CATALOGO_VERSAO = 2;

const MODULOS_DA_VERSAO = {
  2: ['chat', 'anotacoes', 'diario'],
};

function modulosDepoisDe(versao) {
  const novos = [];
  for (let v = (versao || 1) + 1; v <= CATALOGO_VERSAO; v++) {
    novos.push(...(MODULOS_DA_VERSAO[v] || []));
  }
  return novos;
}

// Dono de grupo: o cliente que contratou para uma rede e administra as
// lojas dele. Ganha a tela de Lojas — limitada ao grupo dele pelo servidor,
// que é onde a separação entre clientes é decidida de verdade. Esconder o
// item do menu não protege nada; filtrar a consulta protege.
export function ehDonoDeGrupo(profile) {
  return !!profile?.grupo && ['admin', 'master'].includes(profile?.access_level)
    && profile?.access_level !== 'master';
}

export function getEffectivePermissions(profile) {
  if (profile?.access_level === 'master') return DEFAULT_PERMISSIONS.master;

  if (ehDonoDeGrupo(profile)) {
    const base = profile?.permissions?.length
      ? profile.permissions
      : (DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.admin);
    return base.includes('lojas') ? base : [...base, 'lojas'];
  }

  if (profile?.permissions?.length) {
    const padrao = DEFAULT_PERMISSIONS[profile?.access_level] || DEFAULT_PERMISSIONS.lider;
    // Módulo novo só entra se o nível da pessoa o teria por padrão.
    const novos = modulosDepoisDe(profile.permissions_versao)
      .filter(k => padrao.includes(k) && !profile.permissions.includes(k));
    return novos.length ? [...profile.permissions, ...novos] : profile.permissions;
  }

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

// Módulo que o cargo da pessoa teria, mas a loja ainda não contratou.
//
// É diferente de "não tem permissão": aqui a pessoa PODERIA usar, só falta a
// loja assinar o módulo. Antes os dois casos terminavam igual — o item sumia
// do menu — e o cliente que pagou entrava, não via Vendas nem Estoque e
// concluía que o produto era menor do que foi vendido. Ninguém abre chamado
// para reclamar de algo que não sabe que existe.
//
// Mostrar com cadeado resolve os dois lados: a pessoa entende que existe e
// como ter, e vira oportunidade de venda em vez de decepção silenciosa.
export function moduloNaoContratado(profile, key) {
  if (!PREMIUM_MODULES.includes(key)) return false;
  if (profile?.access_level === 'master') return false;
  if (!getEffectivePermissions(profile).includes(key)) return false;
  return !(profile?.modulos_premium || []).includes(key);
}
