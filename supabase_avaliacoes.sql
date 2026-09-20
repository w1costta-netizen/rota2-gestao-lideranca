-- Avaliações do app pelos usuários (estrelas + depoimento), com autorização
-- explícita para uso público. Uma por pessoa, editável.
create table if not exists avaliacoes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references profiles(id) on delete cascade,
  company            text,
  estrelas           int not null check (estrelas between 1 and 5),
  texto              text,
  autoriza_publicar  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
alter table avaliacoes enable row level security;

-- "Agora não" no convite do Dashboard: guarda quando adiou, para só voltar
-- a convidar depois de 60 dias.
alter table profiles add column if not exists avaliacao_adiada_em timestamptz;
