-- ═══════════════════════════════════════════════════════════════
-- FECHAR AS 16 REGRAS QUE ESTAVAM LIBERANDO GERAL
--
-- O QUE ESTAVA ACONTECENDO
-- Dezesseis tabelas tinham política `using (true)` valendo para
-- `public` — ou seja, para QUALQUER UM, inclusive quem não está
-- logado. A chave pública do Supabase viaja dentro do arquivo que o
-- navegador baixa; qualquer pessoa com o endereço do projeto podia
-- chamar a API do banco direto e ler (e, nestas, também gravar) as
-- tarefas, os comunicados, o mural, a escala e a equipe de TODAS as
-- empresas, sem passar pelo nosso app.
--
-- Sobre gravar: numa política `FOR ALL`, quando `with_check` é nulo o
-- Postgres usa a mesma expressão do `using`. Com `using (true)`, isso
-- libera leitura E escrita. Não eram "só leitura".
--
-- POR QUE APAGAR, E NÃO TROCAR POR UMA REGRA DE EMPRESA
-- Nenhuma destas tabelas é consultada direto pelo navegador — foi
-- conferido no código, e o app também não escuta nada em tempo real.
-- Todas passam pelo nosso servidor, que usa a chave secreta e ignora
-- o RLS. Então o estado correto aqui é RLS LIGADO E NENHUMA REGRA:
-- porta trancada, só o servidor entra. É o mesmo estado em que já
-- estão 26 tabelas do projeto (tarefas do plano, atas, diário,
-- mensagens, metas, listas, auditoria...).
--
-- Regra de empresa só é necessária onde o navegador fala direto com o
-- banco — profiles, vendas_atual, vendas_historico e estoque_payloads,
-- que já estão resolvidas em supabase_rls_leituras_diretas.sql.
--
-- DEPOIS DE RODAR: abra o app e passe por Escala, Tarefas,
-- Comunicados, Mural, Agenda, Equipe e Campanhas. Se alguma tela
-- parar de carregar, é sinal de que ela lê a tabela direto e passou
-- despercebido — avise, que aí a regra certa é de empresa, não apagar.
-- ═══════════════════════════════════════════════════════════════


-- ══ PASSO 1 — VER O QUE SAI ═════════════════════════════════
-- Confere que são exatamente estas 16 antes de mexer.
select tablename, policyname, roles::text as vale_para, cmd
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')
order by tablename;


-- ══ PASSO 2 — FECHAR ════════════════════════════════════════

drop policy if exists "allow_all_agenda"                        on agenda_items;
drop policy if exists "Service role full access to alert_logs"  on alert_logs;
drop policy if exists "acesso"                                  on campanha_evidencias;
drop policy if exists "acesso"                                  on campanha_itens;
drop policy if exists "acesso"                                  on campanhas;
drop policy if exists "Service role full access to company_roles"   on company_roles;
drop policy if exists "Service role full access to company_sectors" on company_sectors;
drop policy if exists "acesso_empresa"                          on comunicados;
drop policy if exists "acesso_empresa"                          on comunicados_lidos;
drop policy if exists "allow_all_leaders"                       on leaders;
drop policy if exists "acesso"                                  on mural;
drop policy if exists "service role only"                       on reacoes;
drop policy if exists "service role only"                       on schedule_entries;
drop policy if exists "service role only"                       on schedule_submissions;
drop policy if exists "acesso"                                  on tarefas;
drop policy if exists "service role only"                       on team_members;

-- Garante que o RLS continua LIGADO nas 16 (apagar política não
-- desliga o RLS, mas é barato confirmar — RLS desligado com zero
-- políticas seria o oposto do que queremos: tudo liberado).
do $$
declare t text;
begin
  foreach t in array array[
    'agenda_items','alert_logs','campanha_evidencias','campanha_itens',
    'campanhas','company_roles','company_sectors','comunicados',
    'comunicados_lidos','leaders','mural','reacoes','schedule_entries',
    'schedule_submissions','tarefas','team_members'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;


-- ══ PASSO 3 — CONFERIR ══════════════════════════════════════
-- (a) Tem que vir VAZIO: nenhuma regra liberando geral.
select tablename, policyname, roles::text as vale_para
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')
order by tablename;

-- (b) As 16 têm que aparecer com rls_ligado = true e regras = 0.
select t.tablename,
       t.rowsecurity as rls_ligado,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as regras
from pg_tables t
where t.schemaname = 'public'
  and t.tablename in (
    'agenda_items','alert_logs','campanha_evidencias','campanha_itens',
    'campanhas','company_roles','company_sectors','comunicados',
    'comunicados_lidos','leaders','mural','reacoes','schedule_entries',
    'schedule_submissions','tarefas','team_members')
order by t.tablename;
