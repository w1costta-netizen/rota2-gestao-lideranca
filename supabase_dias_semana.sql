-- Repetição em DIAS ESPECÍFICOS da semana.
--
-- As repetições existentes (todo dia, toda semana, 15 dias, todo mês) não
-- resolvem o caso mais comum do plano de ação: "os líderes checam de segunda
-- a quarta". Quem precisava disso marcava "todo dia" e a pessoa recebia a
-- tarefa também na quinta, na sexta e no domingo — ou marcava "toda semana"
-- e perdia dois dos três dias.
--
-- Guardado como lista de números do dia da semana: 0 = domingo ... 6 = sábado.
-- É a mesma numeração do JavaScript, para não precisar converter em lugar
-- nenhum — conversão de dia da semana é fonte clássica de erro de um dia.

alter table acoes_pdca add column if not exists dias_semana smallint[];
alter table tarefas    add column if not exists dias_semana smallint[];

comment on column acoes_pdca.dias_semana is
  'Dias da semana quando recorrencia = dias_semana. 0=domingo ... 6=sabado.';
comment on column tarefas.dias_semana is
  'Dias da semana quando recorrencia = dias_semana. 0=domingo ... 6=sabado.';
