-- Módulo "Ata de Reunião" (Gestão do Tempo e Produtividade)
-- Todos os cargos podem criar. Participantes são usuários reais da equipe
-- (assinatura só pode ser feita pelo próprio dono da conta). Acesso
-- exclusivamente via backend (service role) — RLS travado, sem policies,
-- mesmo padrão já usado em mural/pending_signups/listas.

alter table profiles add column if not exists assinatura_texto text;

create table if not exists atas_reuniao (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  criado_por uuid not null references profiles(id),
  titulo text not null,
  data date not null,
  hora_inicio text,
  hora_fim text,
  local text,
  participantes uuid[] not null default '{}',
  pauta jsonb not null default '[]',
  decisoes jsonb not null default '[]',
  acoes jsonb not null default '[]',
  proxima_reuniao date,
  created_at timestamptz not null default now()
);

create table if not exists ata_comentarios (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references atas_reuniao(id) on delete cascade,
  autor_id uuid not null references profiles(id),
  texto text not null,
  created_at timestamptz not null default now()
);

create table if not exists ata_assinaturas (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references atas_reuniao(id) on delete cascade,
  user_id uuid not null references profiles(id),
  texto_assinatura text not null,
  assinado_em timestamptz not null default now(),
  unique(ata_id, user_id)
);

create index if not exists idx_atas_company on atas_reuniao(company);
create index if not exists idx_ata_comentarios_ata on ata_comentarios(ata_id);
create index if not exists idx_ata_assinaturas_ata on ata_assinaturas(ata_id);

alter table atas_reuniao enable row level security;
alter table ata_comentarios enable row level security;
alter table ata_assinaturas enable row level security;
