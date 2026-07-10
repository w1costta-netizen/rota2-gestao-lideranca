-- Execute no Supabase SQL Editor
-- Tabela de logs de alertas enviados

create table if not exists alert_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  type       text not null,   -- 'schedule_reminder'
  channel    text not null,   -- 'email' | 'whatsapp' | 'push'
  year       integer,
  month      integer,
  day        integer,
  recipient  text,
  subject    text,
  body       text,
  sent_at    timestamptz default now(),
  read_at    timestamptz
);

alter table alert_logs enable row level security;

create policy "Service role full access to alert_logs"
  on alert_logs for all
  using (true);
