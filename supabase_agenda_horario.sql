-- Agenda: horário de FIM e compromisso de dia inteiro.
--
-- Até aqui o item tinha só `time`, que é a hora de início. Não dava para
-- dizer quanto tempo o compromisso ocupa, nem marcar um evento que toma o
-- dia inteiro — e sem isso ninguém consegue olhar a agenda e saber se ainda
-- cabe alguma coisa naquele dia.

alter table agenda_items add column if not exists hora_fim text;

-- Dia inteiro é estado próprio, e não "das 00:00 às 23:59": escrito como
-- horário, ele apareceria na lista como um compromisso de madrugada e
-- entraria em qualquer conta de conflito de horário.
alter table agenda_items add column if not exists dia_todo boolean not null default false;

comment on column agenda_items.hora_fim is 'Hora de término (HH:MM). Vazio = só a hora de início.';
comment on column agenda_items.dia_todo is 'Compromisso que ocupa o dia inteiro; ignora time e hora_fim.';
