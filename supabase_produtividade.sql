-- Módulo "Gestão do Tempo e Produtividade" — progresso dos 7 treinamentos fixos
-- Rode este script no SQL Editor do Supabase antes de usar o módulo.

create table if not exists progresso_produtividade (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references profiles(id) on delete cascade,
  company         text,
  treinamento_id  int  not null check (treinamento_id between 1 and 7),
  etapa_atual     int  not null default 0,
  total_etapas    int  not null default 5,
  concluido       boolean not null default false,
  concluido_em    timestamptz,
  ultimo_acesso   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (colaborador_id, treinamento_id)
);

create index if not exists idx_progresso_produtividade_colaborador on progresso_produtividade (colaborador_id);
create index if not exists idx_progresso_produtividade_company     on progresso_produtividade (company);

alter table progresso_produtividade enable row level security;

-- Cada um só vê/edita o próprio progresso; leitura ampliada pra quem gerencia
-- equipe (admin/supervisor/master) fica a cargo do backend (service role),
-- que já valida o cargo antes de consultar o time inteiro.
drop policy if exists "progresso_produtividade_select_own" on progresso_produtividade;
create policy "progresso_produtividade_select_own"
  on progresso_produtividade for select
  using (auth.uid() = colaborador_id);

drop policy if exists "progresso_produtividade_upsert_own" on progresso_produtividade;
create policy "progresso_produtividade_upsert_own"
  on progresso_produtividade for insert
  with check (auth.uid() = colaborador_id);

drop policy if exists "progresso_produtividade_update_own" on progresso_produtividade;
create policy "progresso_produtividade_update_own"
  on progresso_produtividade for update
  using (auth.uid() = colaborador_id);
