-- ─────────────────────────────────────────────────────────────
-- Observação no lançamento da meta.
--
-- O lançamento guardava só o número. Três meses depois ninguém lembra por
-- que a semana caiu — e o gráfico vira uma linha sem explicação. Aqui fica
-- o "o que explica esse número", que é o que transforma o gráfico em
-- conversa de reunião.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

alter table metas_lancamentos add column if not exists observacao text;
