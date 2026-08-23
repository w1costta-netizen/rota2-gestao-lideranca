-- Módulos premium contratados por loja (Vendas, Estoque, Conferência de Seção, Flyers)
-- Controlado apenas pelo master, ativado sob demanda por loja.
alter table stores
  add column if not exists modulos_premium text[] not null default '{}';

-- Libera os módulos premium para as lojas que já usam o sistema hoje,
-- para ninguém perder acesso ao que já usava. Lojas novas (ex.: vindas
-- da Hotmart) começam sem nenhum módulo premium, até serem liberadas.
update stores
set modulos_premium = array['vendas_gestao', 'vendas_painel', 'estoque', 'importador_estoque', 'conferencia_secao', 'campanhas']
where active = true;
