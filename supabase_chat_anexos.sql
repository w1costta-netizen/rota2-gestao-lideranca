-- Anexos e áudio nas Conversas.

-- 1) Colunas novas na mensagem. `texto` continua sendo o corpo; nas
--    mensagens de arquivo ele guarda a legenda (ou fica vazio).
alter table mensagens add column if not exists tipo             text not null default 'texto';
alter table mensagens add column if not exists arquivo_path     text;
alter table mensagens add column if not exists arquivo_nome     text;
alter table mensagens add column if not exists arquivo_tamanho  bigint;
alter table mensagens add column if not exists duracao          int;

-- O texto deixa de ser obrigatório: mensagem de foto ou áudio pode vir sem
-- legenda nenhuma.
alter table mensagens alter column texto drop not null;
alter table mensagens alter column texto set default '';

-- 2) Espaço de armazenamento FECHADO para os anexos.
--
--    Diferente do bucket "evidencias" (público), este NÃO é público: ali
--    qualquer pessoa com o link abre o arquivo, o que é inaceitável para
--    conversa privada. Aqui o arquivo só é acessível por um link temporário
--    que o servidor gera, e só para quem participa da conversa.
insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do nothing;
