-- Lixeira de listas: apagar só marca a data; a lista some da tela e pode
-- ser restaurada em até 30 dias. Depois disso o servidor apaga de vez
-- (junto com os itens, pelo on delete cascade que já existe).
alter table listas add column if not exists excluida_em timestamptz;
create index if not exists idx_listas_excluida on listas(user_id, excluida_em);
