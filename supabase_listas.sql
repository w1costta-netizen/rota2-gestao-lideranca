-- Módulo "Listas" (Gestão do Tempo e Produtividade) — listas pessoais tipo
-- Todoist, só o próprio usuário vê as suas. Acesso exclusivamente via
-- backend (service role), então RLS fica travado sem policies, igual ao
-- padrão já usado em mural/pending_signups.

create table if not exists listas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  nome text not null,
  emoji text default '📝',
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists lista_itens (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references listas(id) on delete cascade,
  texto text not null,
  concluido boolean not null default false,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_listas_user on listas(user_id);
create index if not exists idx_lista_itens_lista on lista_itens(lista_id);

alter table listas enable row level security;
alter table lista_itens enable row level security;
