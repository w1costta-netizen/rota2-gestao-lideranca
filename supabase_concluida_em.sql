-- Quando e quem concluiu cada tarefa (21/10/2026). Vale para todas as empresas.
alter table tarefas add column if not exists concluida_em timestamptz;
alter table tarefas add column if not exists concluida_por uuid references profiles(id) on delete set null;

-- Histórico: a hora da conclusão das que já estão concluídas...
update tarefas set concluida_em = updated_at where status = 'concluida' and concluida_em is null;
-- ...e quem concluiu, achado no registro de auditoria do mesmo instante.
update tarefas t set concluida_por = l.user_id
  from audit_logs l
 where t.status = 'concluida' and t.concluida_por is null
   and l.acao = 'editar_tarefa' and l.depois->>'status' = 'concluida'
   and l.antes->>'title' = t.title
   and abs(extract(epoch from (l.created_at - t.updated_at))) < 5;

notify pgrst, 'reload schema';

select
  count(*) filter (where status = 'concluida')        as concluidas,
  count(*) filter (where concluida_em is not null)    as com_hora,
  count(*) filter (where concluida_por is not null)   as com_quem_concluiu
from tarefas;
