-- ─────────────────────────────────────────────────────────────
-- LIMPAR AS TAREFAS DE MEDIÇÃO DUPLICADAS
--
-- Causa: ao salvar a ação do C, a limpeza apagava só as tarefas PENDENTES
-- (as concluídas ficam, são o registro do que foi medido), mas a criação
-- recriava a lista INTEIRA de datas. Cada save gerava outra tarefa para
-- toda data já concluída. Corrigido no deploy 6477096 — isto aqui limpa o
-- que ficou para trás.
--
-- RODE NA ORDEM. O passo 1 só MOSTRA; nada é apagado até o passo 3.
-- ─────────────────────────────────────────────────────────────


-- ══ PASSO 1 — CONFERIR (não apaga nada) ═════════════════════
-- Quantas repetições existem, por ação e por data. Se vier vazio, não há
-- duplicada e não precisa fazer mais nada.

select
  t.pdca_context->>'plano_titulo'      as plano,
  t.title                              as tarefa,
  p.full_name                          as responsavel,
  t.due_date                           as data,
  count(*)                             as quantas,
  count(*) - 1                         as seriam_apagadas
from tarefas t
left join profiles p on p.id = t.assigned_to
where t.pdca_context->>'medicao' = 'true'
group by 1, 2, 3, 4
having count(*) > 1
order by t.due_date, 1;


-- ══ PASSO 2 — VER EXATAMENTE O QUE SAI ══════════════════════
-- Uma linha por tarefa que seria apagada.
--
-- QUAL FICA: a concluída na frente (ela guarda o registro da medição);
-- depois a que tem comentário (comentário é trabalho de gente, não pode
-- sumir); por último a mais antiga. Só as repetições depois dessa saem.

with ordenadas as (
  select
    t.id, t.title, t.due_date, t.status, t.created_at, t.assigned_to,
    (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) as comentarios,
    row_number() over (
      partition by t.pdca_context->>'acao_id', t.assigned_to, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
  where t.pdca_context->>'medicao' = 'true'
)
select o.due_date as data, o.title as tarefa, p.full_name as responsavel,
       o.status, o.comentarios, o.created_at as criada_em
from ordenadas o
left join profiles p on p.id = o.assigned_to
where o.ordem > 1
order by o.due_date, o.title;


-- ══ PASSO 3 — APAGAR ════════════════════════════════════════
-- Só rode depois de olhar o passo 2 e concordar com a lista.
-- Apaga os comentários das tarefas que saem antes da tarefa em si: se a
-- tabela não apagar em cascata, o delete falharia por vínculo.

with ordenadas as (
  select
    t.id,
    row_number() over (
      partition by t.pdca_context->>'acao_id', t.assigned_to, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
  where t.pdca_context->>'medicao' = 'true'
)
delete from tarefa_comentarios
where tarefa_id in (select id from ordenadas where ordem > 1);

with ordenadas as (
  select
    t.id,
    row_number() over (
      partition by t.pdca_context->>'acao_id', t.assigned_to, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
  where t.pdca_context->>'medicao' = 'true'
)
delete from tarefas
where id in (select id from ordenadas where ordem > 1);


-- ══ PASSO 4 — CONFERIR DE NOVO ══════════════════════════════
-- Rode o PASSO 1 outra vez. Tem que vir vazio.
