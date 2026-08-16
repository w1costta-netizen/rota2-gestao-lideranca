-- Conferência de Seção — Linha e Fine Line viram multi-seleção (várias por sessão)
-- Rode no SQL Editor do Supabase.

alter table conferencias_secao
  alter column linha type text[] using case when linha is null or linha = '' then null else array[linha] end;

alter table conferencias_secao
  alter column sulinha type text[] using case when sulinha is null or sulinha = '' then null else array[sulinha] end;
