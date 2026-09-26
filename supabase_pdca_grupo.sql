-- ─────────────────────────────────────────────────────────────
-- Ação para várias pessoas: uma ação, vários responsáveis.
--
-- Escolher 5 líderes criava 5 ações idênticas, com o mesmo texto longo
-- repetido 5 vezes na tela — o plano virava um paredão ilegível. Cada
-- pessoa continua com a SUA linha (é ela que vira tarefa e que cada um
-- conclui no seu tempo), mas todas passam a carregar o mesmo `grupo_id`,
-- e a tela mostra um cartão só com os responsáveis dentro.
--
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

alter table acoes_pdca add column if not exists grupo_id uuid;
create index if not exists idx_acoes_pdca_grupo on acoes_pdca (grupo_id);
