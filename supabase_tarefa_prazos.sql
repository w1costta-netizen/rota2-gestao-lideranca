-- ─────────────────────────────────────────────────────────────
-- Pedido de novo prazo ("repactuação") nas tarefas.
--
-- Havia tarefa que a pessoa não conclui no dia por um motivo legítimo —
-- depende de terceiro, de compra, de outra área. Ela cumpria a parte dela,
-- avisava, e o app continuava dizendo só "atrasada", sem onde combinar a
-- data nova. Aqui fica o pedido, o motivo e a decisão de quem criou a
-- tarefa. Uma linha por pedido: o histórico inteiro é a prova de que foi
-- comunicado e repactuado.
--
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

create table if not exists tarefa_prazos (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references tarefas(id) on delete cascade,
  pedido_por   uuid not null references profiles(id) on delete cascade,
  data_antiga  date,
  data_nova    date not null,
  motivo       text not null,
  situacao     text not null default 'pendente',   -- pendente | aceito | recusado
  decidido_por uuid references profiles(id) on delete set null,
  decidido_em  timestamptz,
  resposta     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_tarefa_prazos_tarefa on tarefa_prazos (tarefa_id);
-- Um pedido pendente por tarefa: sem isso, dois toques no botão viram dois
-- pedidos e quem aprova não sabe qual vale.
create unique index if not exists idx_tarefa_prazo_pendente
  on tarefa_prazos (tarefa_id) where situacao = 'pendente';

alter table tarefa_prazos enable row level security;
-- O app fala com esta tabela só pelo servidor (chave de serviço, que passa
-- por cima da RLS). Sem política nenhuma, o navegador não lê nada direto.
