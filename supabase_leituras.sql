-- ─────────────────────────────────────────────────────────────
-- "Já vi isto" — uma linha por pessoa, por item.
--
-- O mural e os comunicados já têm as tabelas deles dizendo SE a pessoa leu.
-- O que faltava era QUANDO ela viu pela última vez, que é o único jeito de
-- saber se um comentário é novo para ela. E o Diário de Bordo não tinha
-- registro nenhum de leitura.
--
-- `visto_em` é atualizado toda vez que a pessoa abre o item (ou os
-- comentários dele). Comentário com `created_at` depois disso é novo.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

create table if not exists leituras (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references profiles(id) on delete cascade,
  tipo     text not null,        -- 'diario' | 'mural' | 'comunicado'
  item_id  uuid not null,
  visto_em timestamptz not null default now(),
  unique (user_id, tipo, item_id)
);

create index if not exists idx_leituras_user_tipo on leituras (user_id, tipo);

alter table leituras enable row level security;

-- Cada pessoa só enxerga e escreve as próprias leituras. O servidor usa a
-- chave de serviço e passa por cima disto — estas políticas valem para o
-- app no navegador.
drop policy if exists leituras_proprias on leituras;
create policy leituras_proprias on leituras for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
