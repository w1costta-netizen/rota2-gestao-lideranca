-- Grupo de lojas: o cliente que contrata para uma rede.
--
-- Até aqui o mundo era binário: ou master (vê tudo) ou admin de uma loja
-- só. Não havia como um cliente administrar as próprias lojas sem enxergar
-- as dos outros — e rede é o cliente mais valioso de um sistema assim.
--
-- A marca fica na LOJA e na conta DONA, nunca nas pessoas: quem trabalha
-- na loja não muda de lugar nem percebe diferença.

alter table stores   add column if not exists grupo text;
alter table profiles add column if not exists grupo text;

-- Deixa a busca por grupo barata quando existirem muitas lojas.
create index if not exists idx_stores_grupo on stores (grupo);

-- ── Estado atual do sistema ────────────────────────────────────────
-- Sam's Club Recife passa a ser a primeira loja do grupo "Sam's Clube".
-- A loja da Marcia fica SEM grupo de propósito: é cliente separada, e é
-- ela que prova o isolamento funcionando com dado real.
update stores set grupo = 'Sam''s Clube' where name = 'Sam''s Club Recife';

-- willian_costa_2 deixa de ser master (não é dona do sistema) e vira dona
-- do grupo: administra as lojas do Sam's Clube e mais nenhuma.
update profiles
set grupo        = 'Sam''s Clube',
    access_level = 'admin',
    company      = 'Sam''s Club Recife'
where email = 'willian_costa_2@carrefour.com';
