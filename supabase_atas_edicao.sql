-- Edição de ata já criada.
--
-- Guarda quem editou e quando. Num documento que se assina, "foi alterado
-- depois" é informação tão importante quanto o conteúdo — sem isso, quem
-- lê não tem como saber que o texto mudou desde a reunião.

alter table atas_reuniao add column if not exists editado_em  timestamptz;
alter table atas_reuniao add column if not exists editado_por uuid references profiles(id) on delete set null;
