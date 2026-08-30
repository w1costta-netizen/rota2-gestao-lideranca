-- Comentários no Mural e nos Comunicados
-- Mesmo padrão já usado em tarefa_comentarios e ata_comentarios.
-- Acesso só pelo backend (service role) — RLS ligado sem policies.

create table if not exists mural_comentarios (
  id uuid primary key default gen_random_uuid(),
  mural_id uuid not null references mural(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists comunicado_comentarios (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references comunicados(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_mural_coment_item on mural_comentarios(mural_id);
create index if not exists idx_comunicado_coment_item on comunicado_comentarios(comunicado_id);

alter table mural_comentarios enable row level security;
alter table comunicado_comentarios enable row level security;
