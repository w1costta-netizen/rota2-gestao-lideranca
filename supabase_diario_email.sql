-- Diário de Bordo por e-mail para o gerente (03:00, dia anterior).
-- stores.ultimo_diario_email: última data já enviada (um e-mail por loja por dia).
-- profiles.email_diario: o gerente pode desligar pelo rodapé ou no perfil.
alter table stores   add column if not exists ultimo_diario_email date;
alter table profiles add column if not exists email_diario boolean not null default true;
