-- ─────────────────────────────────────────────────────────────
-- Datas da medição (quadrante C do PDCA).
--
-- Com "repete toda semana" o app criava UMA tarefa: a próxima só nascia
-- quando a pessoa concluía a anterior. Se ela não concluísse, as medições
-- seguintes nunca apareciam — e o calendário da coleta não existia em
-- lugar nenhum para o gestor conferir.
--
-- Agora a ação do C guarda a LISTA de datas combinadas, e cada data vira
-- uma tarefa própria para o responsável, criada na hora.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

alter table acoes_pdca add column if not exists datas_medicao date[];
