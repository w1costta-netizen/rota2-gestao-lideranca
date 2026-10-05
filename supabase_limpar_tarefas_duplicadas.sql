-- ─────────────────────────────────────────────────────────────
-- LIMPAR TAREFAS DUPLICADAS PELA RECORRÊNCIA
--
-- Causa (corrigida no deploy ce4ffbb): ao concluir uma tarefa que se
-- repete, o servidor criava a próxima SEM conferir se ela já existia.
-- Concluir, reabrir e concluir de novo gerava outra cópia — e o círculo da
-- tarefa cicla pendente → em andamento → concluída → pendente, então isso
-- acontecia sem ninguém querer. As cópias também nasciam sem o vínculo com
-- o plano, por isso não apareciam nas buscas por tarefa de plano.
--
-- RODE NA ORDEM. Até o passo 2 nada é apagado.
-- ─────────────────────────────────────────────────────────────


-- ══ PASSO 1 — CONFERIR ══════════════════════════════════════
select
  pr.full_name as responsavel,
  left(t.title, 50) as tarefa,
  t.due_date   as data,
  count(*)     as quantas,
  count(*) filter (where t.status = 'concluida') as concluidas
from tarefas t
left join profiles pr on pr.id = t.assigned_to
group by 1, 2, t.title, 3
having count(*) > 1
order by quantas desc, t.due_date;


-- ══ PASSO 2 — VER O QUE SAI ═════════════════════════════════
-- QUAL FICA, nesta ordem: a concluída (guarda o registro de que foi
-- feita); depois a que tem comentário (comentário é trabalho de gente);
-- por último a mais antiga. Só as repetições DEPOIS dessa saem.

with ordenadas as (
  select
    t.id, t.title, t.due_date, t.status, t.created_at, t.assigned_to,
    (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) as comentarios,
    row_number() over (
      partition by t.assigned_to, t.title, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
)
select pr.full_name as responsavel, left(o.title, 50) as tarefa,
       o.due_date as data, o.status, o.comentarios, o.created_at as criada_em
from ordenadas o
left join profiles pr on pr.id = o.assigned_to
where o.ordem > 1
order by o.due_date, pr.full_name;


-- ══ PASSO 3 — APAGAR ════════════════════════════════════════
-- Só depois de olhar o passo 2. São duas instruções: a primeira tira os
-- comentários das que saem (se a tabela não apagar em cascata, o delete
-- falharia por vínculo); a segunda tira as tarefas.

with ordenadas as (
  select t.id,
    row_number() over (
      partition by t.assigned_to, t.title, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
)
delete from tarefa_comentarios
where tarefa_id in (select id from ordenadas where ordem > 1);

with ordenadas as (
  select t.id,
    row_number() over (
      partition by t.assigned_to, t.title, t.due_date
      order by
        (t.status = 'concluida') desc,
        (select count(*) from tarefa_comentarios c where c.tarefa_id = t.id) desc,
        t.created_at asc
    ) as ordem
  from tarefas t
)
delete from tarefas
where id in (select id from ordenadas where ordem > 1);


-- ══ PASSO 4 — CONFERIR ══════════════════════════════════════
-- Rode o PASSO 1 de novo. Tem que vir vazio.
