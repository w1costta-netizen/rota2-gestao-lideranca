-- Metas por setor: a meta pode ser desdobrada (NAL, Mercearia, Perecíveis…),
-- cada setor com partida e alvo próprios. O lançamento ganha `setor`
-- ('' = total da loja/clube). Quantidade e R$ do total saem da soma dos
-- setores; percentual do total é lançado (ou média ponderada por R$).
alter table metas add column if not exists setores jsonb not null default '[]'::jsonb;
alter table metas_lancamentos add column if not exists setor text not null default '';
alter table metas_lancamentos drop constraint if exists metas_lancamentos_meta_id_data_key;
alter table metas_lancamentos add constraint metas_lancamentos_meta_data_setor_key unique (meta_id, data, setor);
