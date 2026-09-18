-- Comentários nos relatos do Diário de Bordo.
-- Mesmo formato de mural_comentarios / comunicado_comentarios, para o
-- componente <Comentarios> do frontend servir sem mudança.
-- As reações usam a tabela genérica `reacoes` com tipo = 'diario'.

create table if not exists diario_comentarios (
  id          uuid primary key default gen_random_uuid(),
  diario_id   uuid not null references diario_bordo(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  text        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists idx_diario_coment_item on diario_comentarios(diario_id);

-- Só o backend (chave de serviço) acessa; RLS ligada sem política fecha
-- a porta para o cliente anônimo, igual às outras tabelas de comentário.
alter table diario_comentarios enable row level security;
