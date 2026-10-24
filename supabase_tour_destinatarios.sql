-- Tour 4x4: para quem é o tour (24/10/2026).
-- para_tipo: 'eu' (só para mim), 'pessoas' (pessoas específicas), 'todos' (toda a liderança).
-- Vazio = tour antigo: continua como era (todos veem) e não entra no painel.
alter table relatorios_fotograficos
  add column if not exists para_tipo text check (para_tipo in ('eu', 'pessoas', 'todos')),
  add column if not exists destinatarios uuid[] not null default '{}';

create index if not exists relatorios_fotograficos_destinatarios_idx
  on relatorios_fotograficos using gin (destinatarios);

-- Conferência: os tours que já existem ficam todos como "antigos".
select count(*) as tours, count(para_tipo) as com_destino from relatorios_fotograficos;
