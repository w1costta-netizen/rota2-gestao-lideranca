-- Resultados puxando do Plano de Ação (PDCA)
--
-- A verificação do C já diz o que vai ser medido, por quem, em que datas e
-- até quando. Antes disso tudo era redigitado em Resultados. Agora a meta
-- guarda o vínculo com a ação do C e lê o resto de lá.
--
-- Guardamos o VÍNCULO, não uma cópia das datas: se o calendário do plano
-- mudar depois, Resultados acompanha sozinho em vez de ficar desencontrado.

alter table metas add column if not exists acao_id uuid
  references acoes_pdca(id) on delete set null;

-- Quem lança o número. Vem do "quem vai medir" da ação do C quando a meta
-- nasce de um plano; pode ser escolhido à mão numa meta solta.
alter table metas add column if not exists responsavel_id uuid
  references profiles(id) on delete set null;

create index if not exists idx_metas_acao on metas(acao_id);

comment on column metas.acao_id is
  'Ação do quadrante C que esta meta verifica. Fonte das datas de medição.';
comment on column metas.responsavel_id is
  'Quem lança o número. Puxado do responsável da ação do C.';
