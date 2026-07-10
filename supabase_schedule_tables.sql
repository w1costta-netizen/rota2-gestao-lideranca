-- Execute este SQL no Supabase SQL Editor

-- Colaboradores do setor de cada líder
create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  matricula   text,
  name        text not null,
  role        text,
  sector      text,
  active      boolean default true,
  created_at  timestamptz default now(),
  unique (user_id, matricula)
);

alter table team_members enable row level security;
create policy "users own team" on team_members for all using (auth.uid() = user_id);

-- Entradas de escala nativa (uma por colaborador por dia)
create table if not exists schedule_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  team_member_id  uuid not null references team_members(id) on delete cascade,
  work_date       date not null,
  day_of_week     text not null,
  week_start      date not null,
  start_time      text,
  end_time        text,
  status          text not null default 'trabalha',
  notes           text,
  created_at      timestamptz default now(),
  unique (user_id, team_member_id, work_date)
);

alter table schedule_entries enable row level security;
create policy "users own schedule" on schedule_entries for all using (auth.uid() = user_id);
