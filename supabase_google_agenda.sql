-- ═══════════════════════════════════════════════════════════════
-- GOOGLE AGENDA → AGENDA DO ROTA
--
-- A pessoa conecta a conta Google uma vez; o servidor passa a ler as
-- reuniões dela (só leitura) e põe na Agenda do Rota, como compromisso
-- PESSOAL — visível só para o dono.
--
-- Idempotente: pode rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

-- A conexão de cada pessoa. A "chave de renovação" que o Google devolve
-- fica CIFRADA (AES-256-GCM, chave só no servidor, variável
-- GOOGLE_TOKEN_CHAVE no Render). Vazando o banco, ela não serve para nada.
create table if not exists google_conexoes (
  user_id               uuid primary key references profiles(id) on delete cascade,
  email_google          text,
  refresh_token_cifrado text not null,
  conectado_em          timestamptz not null default now(),
  ultima_sincronizacao  timestamptz,
  -- 'reconectar' quando o Google recusa a renovação (no modo de teste do
  -- Google isso acontece a cada 7 dias; também quando a pessoa revoga).
  ultimo_erro           text
);
alter table google_conexoes enable row level security;
-- (sem nenhuma policy: só o servidor lê e grava)


-- Os compromissos importados moram na mesma tabela da agenda, marcados.
alter table agenda_items add column if not exists origem          text;   -- 'google' ou nulo
alter table agenda_items add column if not exists google_event_id text;

-- Um evento do Google vira UMA linha por pessoa — é o que deixa
-- sincronizar quantas vezes for sem duplicar. Linhas manuais têm
-- google_event_id nulo, e nulo nunca colide num índice único.
create unique index if not exists agenda_items_google_evento
  on agenda_items (created_by, google_event_id);


-- ══ CONFERIR ════════════════════════════════════════════════
select t.tablename, t.rowsecurity as rls_ligado,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as regras
from pg_tables t where t.schemaname = 'public' and t.tablename in ('google_conexoes', 'agenda_items');
-- Os dois: rls_ligado = true e regras = 0.

select column_name from information_schema.columns
where table_name = 'agenda_items' and column_name in ('origem', 'google_event_id');
-- Tem que vir as duas colunas.
