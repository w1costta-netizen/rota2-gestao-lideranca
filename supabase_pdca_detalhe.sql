-- ─────────────────────────────────────────────────────────────
-- A parte de cada um dentro da mesma ação.
--
-- A ação é a mesma para o grupo ("os supervisores farão a blitz"), mas o
-- papel de uma pessoa pode ser diferente. Antes, o único jeito de ajustar
-- era editar a tarefa dela por fora — e a próxima edição da ação apagava
-- esse texto, porque a edição vale para o grupo inteiro.
--
-- `detalhe` é só daquela pessoa: nunca se propaga ao grupo e sobrevive às
-- edições do texto comum.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

alter table acoes_pdca add column if not exists detalhe text;
