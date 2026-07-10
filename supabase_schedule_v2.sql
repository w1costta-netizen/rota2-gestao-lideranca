-- Execute no Supabase SQL Editor
-- Adiciona os 4 campos de horário na tabela schedule_entries

alter table schedule_entries
  add column if not exists entrada           text,
  add column if not exists intervalo         text,
  add column if not exists retorno_intervalo text,
  add column if not exists saida             text,
  add column if not exists feriado           boolean default false;
