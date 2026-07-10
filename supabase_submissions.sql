-- Execute no Supabase SQL Editor
-- Tabela para rastrear submissão de escala mensal por líder

create table if not exists schedule_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  year         integer not null,
  month        integer not null,
  submitted_at timestamptz not null default now(),
  created_at   timestamptz default now(),
  unique(user_id, year, month)
);

-- RLS
alter table schedule_submissions enable row level security;

create policy "Lider vê suas próprias submissões"
  on schedule_submissions for select
  using (auth.uid() = user_id);

create policy "Lider pode submeter sua escala"
  on schedule_submissions for insert
  with check (auth.uid() = user_id);

create policy "Lider pode atualizar sua submissão"
  on schedule_submissions for update
  using (auth.uid() = user_id);
