-- ─────────────────────────────────────────────────────────────
-- Rotina do Plano de Ação: uma tarefa por data (20/10/2026)
-- Vale para TODAS as empresas.
--
-- 1. acoes_pdca.datas_puladas: datas que alguém apagou de propósito —
--    o app não as recria.
-- 2. Se houver alguma regra no banco limitando os valores de
--    tarefas.status, ela sai: o novo valor "nao_realizada" precisa caber.
-- 3. Reabre as rotinas marcadas como concluídas com o prazo ainda
--    correndo (resto do defeito corrigido em 13/10). O app recria as
--    datas que faltam sozinho, de hoje até o prazo.
-- ─────────────────────────────────────────────────────────────

alter table acoes_pdca add column if not exists datas_puladas date[] not null default '{}';

create temp table regras_removidas (nome text, regra text);
do $$
declare c record;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'tarefas'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%'
  loop
    insert into regras_removidas values (c.conname, c.def);
    execute format('alter table tarefas drop constraint %I', c.conname);
  end loop;
end $$;

with reabertas as (
  update acoes_pdca
     set concluida = false, concluida_em = null
   where concluida = true
     and recorrencia is not null and recorrencia <> 'nenhuma'
     and datas_medicao is null
     and prazo >= (now() at time zone 'America/Sao_Paulo')::date
  returning id
)
select
  (select count(*) from reabertas) as rotinas_reabertas,
  exists (select 1 from information_schema.columns
           where table_name = 'acoes_pdca' and column_name = 'datas_puladas') as coluna_datas_puladas,
  coalesce((select string_agg(nome || ': ' || regra, ' | ') from regras_removidas), 'nenhuma') as regras_de_status_removidas;
