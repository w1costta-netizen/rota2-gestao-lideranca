-- Execute no Supabase SQL Editor

-- Tabela de cargos customizados por empresa
create table if not exists company_roles (
  id        uuid primary key default gen_random_uuid(),
  company   text not null,
  role_name text not null,
  sort_order integer default 0,
  created_at timestamptz default now(),
  unique(company, role_name)
);

alter table company_roles enable row level security;
create policy "Service role full access to company_roles"
  on company_roles for all using (true);

-- Adicionar coluna created_by em profiles (quem criou o usuário)
alter table profiles add column if not exists created_by uuid references auth.users(id);
alter table profiles add column if not exists active boolean default true;
alter table profiles add column if not exists first_access boolean default true;
