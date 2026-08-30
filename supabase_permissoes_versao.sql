-- Versão do catálogo de módulos em que uma lista de permissões
-- personalizada foi decidida.
--
-- Sem isso não há como diferenciar duas situações idênticas na tabela:
-- o gestor tirou aquele módulo da pessoa de propósito, ou o módulo nem
-- existia quando a lista foi montada. O resultado era quem tem lista
-- personalizada nunca mais receber nenhuma funcionalidade nova.
--
-- Fica NULO nas linhas antigas de propósito: nulo significa "montada
-- antes deste controle existir", e o app trata como versão 1 — ou seja,
-- essas pessoas recebem os módulos criados depois.

alter table profiles add column if not exists permissions_versao smallint;
