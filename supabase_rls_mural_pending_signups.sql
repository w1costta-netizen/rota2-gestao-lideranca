-- Fecha as duas tabelas apontadas como CRÍTICAS pelo Supabase Advisor:
-- "RLS Disabled in Public" em mural e pending_signups, e "Sensitive Columns
-- Exposed" em pending_signups (a coluna "token" funciona como uma senha —
-- com RLS desligado, qualquer pessoa com a chave anon do projeto conseguia
-- listar todos os tokens/e-mails pendentes de cadastro direto pela API do
-- Supabase, sem passar pelo backend).
--
-- As duas tabelas só são acessadas pelo backend (chave service role, que
-- ignora RLS) — o frontend não faz mais nenhuma consulta direta a elas.
-- Por isso, basta ligar o RLS sem nenhuma política: fica bloqueado para
-- qualquer chamada com a chave anon/authenticated, e o backend continua
-- funcionando normalmente.

alter table mural            enable row level security;
alter table pending_signups  enable row level security;
