-- Cor do item da agenda, escolhida pela pessoa (opcional). Sem cor, a tela
-- usa a do destino (geral/setor/pessoas).
alter table agenda_items add column if not exists cor text;
