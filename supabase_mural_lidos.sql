-- Mural do Time — rastreamento de visualizações (mesma lógica dos comunicados)
-- Rode este script no SQL Editor do Supabase antes de usar.

create table if not exists mural_lidos (
  id        uuid primary key default gen_random_uuid(),
  mural_id  uuid not null references mural(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  read_at   timestamptz not null default now(),
  unique (mural_id, user_id)
);

create index if not exists idx_mural_lidos_mural on mural_lidos (mural_id);
create index if not exists idx_mural_lidos_user  on mural_lidos (user_id);

alter table mural_lidos enable row level security;

drop policy if exists "mural_lidos_select_own" on mural_lidos;
create policy "mural_lidos_select_own"
  on mural_lidos for select
  using (auth.uid() = user_id);

drop policy if exists "mural_lidos_upsert_own" on mural_lidos;
create policy "mural_lidos_upsert_own"
  on mural_lidos for insert
  with check (auth.uid() = user_id);

drop policy if exists "mural_lidos_update_own" on mural_lidos;
create policy "mural_lidos_update_own"
  on mural_lidos for update
  using (auth.uid() = user_id);
