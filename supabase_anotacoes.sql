-- Módulo "Anotações" (Gestão do Tempo e Produtividade) — anotações pessoais
-- no modelo Google Keep: cartão colorido, fixar no topo, busca e voz.
-- Só o próprio usuário vê as suas, igual ao módulo Listas.
--
-- Acesso exclusivamente pelo backend (service role), então o RLS fica
-- ligado e SEM policies — mesmo padrão de listas/mural/pending_signups.

create table if not exists anotacoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  titulo     text not null default '',
  texto      text not null default '',
  -- Nome da cor, não o código: assim a mesma anotação se adapta ao tema
  -- claro e escuro sem migração de dados.
  cor        text not null default 'padrao',
  fixada     boolean not null default false,
  arquivada  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A listagem sempre filtra pelo dono e ordena pelas fixadas primeiro,
-- depois pela alteração mais recente. O índice acompanha essa ordem.
create index if not exists idx_anotacoes_user
  on anotacoes(user_id, fixada desc, updated_at desc);

alter table anotacoes enable row level security;
