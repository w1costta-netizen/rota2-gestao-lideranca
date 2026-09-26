-- ─────────────────────────────────────────────────────────────
-- Ação do PDCA: quando a tarefa COMEÇA e de quanto em quanto tempo repete.
--
-- Antes, a tarefa da ação nascia com a data do PRAZO FINAL e sem repetição:
-- ela só aparecia para a pessoa no último dia, quando já não dava mais para
-- fazer. "Conferir a gôndola toda segunda até o fim do mês" não tinha como
-- ser dito — e é assim que quase toda ação de plano funciona.
--
-- `inicio` é o primeiro dia em que a tarefa aparece; `prazo` continua sendo
-- o limite. A repetição para sozinha ao passar do prazo.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

alter table acoes_pdca add column if not exists inicio date;
alter table acoes_pdca add column if not exists recorrencia text not null default 'nenhuma';
