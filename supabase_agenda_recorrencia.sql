-- Recorrência semanal na agenda: um compromisso fixo vira uma linha por
-- semana, todas com o mesmo serie_id. Editar/excluir "este e os próximos"
-- usa o serie_id + week_start.
alter table agenda_items add column if not exists serie_id uuid;
create index if not exists idx_agenda_serie on agenda_items(serie_id, week_start);
