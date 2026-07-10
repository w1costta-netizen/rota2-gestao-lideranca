-- Execute este SQL no Supabase SQL Editor

create table if not exists cashier_ticket_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  date         date not null,
  day_of_week  text not null,
  hour         int  not null check (hour between 8 and 20),
  tickets      int  not null check (tickets >= 0),
  created_at   timestamptz default now(),
  unique (user_id, date, hour)
);

alter table cashier_ticket_history enable row level security;

create policy "users see own data" on cashier_ticket_history
  for all using (auth.uid() = user_id);
