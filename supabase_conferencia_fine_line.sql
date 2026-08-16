-- Conferência de Seção — adiciona o nível "Fine Line" (Sulinha) entre os
-- seletores em cascata, depois de Linha. Rode no SQL Editor do Supabase
-- antes de reimportar a planilha de conferência.

alter table produtos_conferencia   add column if not exists descricao_sulinha text;
alter table conferencia_filtros    add column if not exists sulinha          text;
alter table conferencias_secao     add column if not exists sulinha          text;

create index if not exists idx_produtos_conferencia_sulinha on produtos_conferencia (descricao_sulinha);
create index if not exists idx_conferencia_filtros_sulinha  on conferencia_filtros (sulinha);
