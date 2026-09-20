-- Metas com número: da loja ou ligadas a um plano de ação (PDCA).
-- Uma meta tem até três medidas (quantidade, reais, percentual), cada uma
-- com valor de partida e alvo; os lançamentos trazem os números juntos,
-- por data. Apagar o plano NÃO apaga a meta: ela vira meta da loja.

create table if not exists metas (
  id          uuid primary key default gen_random_uuid(),
  company     text not null,
  plano_id    uuid references planos_acao(id) on delete set null,
  nome        text not null,
  direcao     text not null default 'aumentar',      -- aumentar | reduzir
  prazo       date not null,
  frequencia  text not null default 'mensal',        -- diario | semanal | mensal
  grafico     text not null default 'auto',          -- auto | linha | barras | progresso
  medidas     jsonb not null default '{}'::jsonb,    -- { quantidade: {inicial, meta}, reais: {...}, percentual: {...} }
  ativa       boolean not null default true,
  criado_por  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists idx_metas_company on metas(company, ativa);
create index if not exists idx_metas_plano on metas(plano_id);

create table if not exists metas_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  meta_id     uuid not null references metas(id) on delete cascade,
  data        date not null,
  valores     jsonb not null default '{}'::jsonb,    -- { quantidade, reais, percentual }
  lancado_por uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (meta_id, data)                             -- na mesma data, o último lançamento substitui
);

alter table metas enable row level security;
alter table metas_lancamentos enable row level security;
