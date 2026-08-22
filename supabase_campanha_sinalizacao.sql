-- Flyers/Campanhas — permite sinalizar um item como "Ruptura" ou "Armazenado,
-- não exposto" em vez de exigir foto. Conta como concluído na auditoria.

alter table campanha_itens add column if not exists sinalizacao      text;
alter table campanha_itens add column if not exists sinalizado_por   uuid references profiles(id);
alter table campanha_itens add column if not exists sinalizado_em    timestamptz;

-- Validação do valor fica a cargo do backend (evita erro de sintaxe do
-- "ADD CONSTRAINT IF NOT EXISTS", que o Postgres não suporta).
