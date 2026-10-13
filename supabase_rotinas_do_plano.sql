-- ─────────────────────────────────────────────────────────────
-- Rotinas do Plano de Ação (13/10/2026)
--
-- 1. Trava contra tarefa duplicada: a mesma ação não pode ter duas tarefas
--    na mesma data. Só é criada se hoje não houver nenhuma duplicada — se
--    houver, o resultado mostra quantas e nada é alterado nessa parte.
--
-- 2. Reabre as ações que se repetem e foram marcadas "concluídas" SOZINHAS.
--    Defeito: concluir a tarefa do dia marcava a ação inteira como feita no
--    plano. A marca dele é a hora: a ação foi "concluída" no mesmo segundo
--    em que uma tarefa dela foi concluída pela tela de Tarefas. Quem marcou
--    a ação à mão no plano não tem essa marca e não é tocado. Só ações que
--    ainda estão dentro do prazo.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from tarefas
    where pdca_context->>'acao_id' is not null
    group by pdca_context->>'acao_id', due_date
    having count(*) > 1
  ) then
    create unique index if not exists tarefas_acao_data_unica
      on tarefas ((pdca_context->>'acao_id'), due_date)
      where pdca_context->>'acao_id' is not null;
  end if;
end $$;

with reabertas as (
  update acoes_pdca a
     set concluida = false, concluida_em = null
   where a.concluida = true
     and a.recorrencia is not null and a.recorrencia <> 'nenhuma'
     and a.datas_medicao is null
     and a.prazo >= (now() at time zone 'America/Sao_Paulo')::date
     and exists (
       select 1 from tarefas t
        where t.pdca_context->>'acao_id' = a.id::text
          and t.status = 'concluida'
          and abs(extract(epoch from (t.updated_at - a.concluida_em))) < 15
     )
  returning a.id
)
select
  (select count(*) from reabertas) as acoes_reabertas,
  exists (select 1 from pg_indexes where indexname = 'tarefas_acao_data_unica') as trava_de_duplicadas,
  (select count(*) from (
     select 1 from tarefas
      where pdca_context->>'acao_id' is not null
      group by pdca_context->>'acao_id', due_date
     having count(*) > 1) d) as datas_duplicadas;
