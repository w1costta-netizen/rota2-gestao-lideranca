-- ═══════════════════════════════════════════════════════════════
-- ANEXOS DAS ANOTAÇÕES — fotos e arquivos presos numa anotação
--
-- Nasce do jeito que as evidências tiveram que ser consertadas às
-- pressas (out/2026), e não do jeito que elas nasceram:
--
--  • BALDE FECHADO desde o primeiro dia. Balde público é servido direto
--    pela internet sem consultar regra nenhuma — foi assim que as fotos
--    de dentro da loja ficaram baixáveis por qualquer um.
--  • O banco guarda o CAMINHO, nunca o endereço. Quem transforma caminho
--    em link (de 1 hora) é o servidor, depois de conferir o dono.
--  • Anotação é PESSOAL: a pasta é o id da PESSOA, não da loja.
--  • Tabela com RLS ligado e ZERO regras: só o servidor lê e grava.
--
-- Idempotente: pode rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════

create table if not exists anotacao_anexos (
  id           uuid primary key default gen_random_uuid(),
  anotacao_id  uuid not null references anotacoes(id) on delete cascade,
  user_id      uuid not null references profiles(id)  on delete cascade,
  -- `<user_id>/<anotacao_id>/<hora>-<nome>` dentro do balde `anotacoes`
  caminho      text not null,
  nome         text not null default '',
  tipo         text not null default '',
  tamanho      integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists anotacao_anexos_por_anotacao on anotacao_anexos (anotacao_id);

alter table anotacao_anexos enable row level security;
-- (sem nenhuma policy de propósito)


-- O balde. `public = false` é o que importa: com ele, ninguém abre um
-- arquivo sem um link assinado pelo servidor.
insert into storage.buckets (id, name, public)
values ('anotacoes', 'anotacoes', false)
on conflict (id) do update set public = false;


-- ══ CONFERIR ════════════════════════════════════════════════
-- Tem que vir: aberto_por_url = false
select id, public as aberto_por_url from storage.buckets where id = 'anotacoes';

-- Tem que vir: rls_ligado = true, regras = 0
select t.tablename, t.rowsecurity as rls_ligado,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as regras
from pg_tables t where t.schemaname = 'public' and t.tablename = 'anotacao_anexos';
