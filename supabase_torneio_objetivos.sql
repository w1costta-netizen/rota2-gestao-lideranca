-- Torneios: campanha do líder para a própria equipe, com objetivos de
-- resultado lançados pelo apurador.
alter table campanhas_gamificacao add column if not exists escopo text not null default 'loja';          -- loja | equipe
alter table campanhas_gamificacao add column if not exists participantes uuid[];                          -- só quando escopo = equipe
alter table campanhas_gamificacao add column if not exists tipo text not null default 'automatica';       -- automatica | objetivo | mista
alter table campanhas_gamificacao add column if not exists objetivos jsonb not null default '[]'::jsonb;  -- [{id,nome,unidade,alvo,direcao,apuracao,peso}]
alter table campanhas_gamificacao add column if not exists apuradores uuid[] not null default '{}';
alter table campanhas_gamificacao add column if not exists frequencia_apuracao text;                      -- semanal | quinzenal | mensal | final
alter table campanhas_gamificacao add column if not exists peso_objetivo int not null default 0;          -- % do placar que vem dos objetivos (mista)

create table if not exists resultados_torneio (
  id              uuid primary key default gen_random_uuid(),
  campanha_id     uuid not null references campanhas_gamificacao(id) on delete cascade,
  objetivo_id     text not null,
  participante_id uuid not null references profiles(id) on delete cascade,
  valor           numeric not null,
  periodo_ref     date,
  observacao      text,
  lancado_por     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_resultados_torneio_campanha on resultados_torneio(campanha_id, objetivo_id, participante_id);
alter table resultados_torneio enable row level security;
