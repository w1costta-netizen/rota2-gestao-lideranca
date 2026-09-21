-- ─────────────────────────────────────────────────────────────
-- Proteção do que o NAVEGADOR acessa direto no Supabase (chave pública).
-- O servidor usa a chave de serviço e passa por cima da RLS; estas
-- políticas valem para o app no navegador: profiles, vendas_atual,
-- vendas_historico, estoque_payloads.
--
-- Regra: cada pessoa só enxerga a PRÓPRIA loja (company do seu profile);
-- o master enxerga tudo. E ninguém muda a própria loja/nível/permissões.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

-- Funções de apoio (SECURITY DEFINER para não cair na própria RLS de profiles)
-- A loja é "minha" se é a do meu perfil, se sou master, ou — dono de grupo —
-- se ela pertence ao mesmo grupo do meu perfil (stores.grupo).
create or replace function public.minha_company() returns text
language sql stable security definer set search_path = public as $$
  select company from profiles where id = auth.uid()
$$;
create or replace function public.sou_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select access_level = 'master' from profiles where id = auth.uid()), false)
$$;
create or replace function public.loja_minha(alvo text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_master()
      or alvo = (select company from profiles where id = auth.uid())
      or exists (
        select 1 from profiles p join stores s on s.grupo = p.grupo
        where p.id = auth.uid() and p.grupo is not null and p.access_level = 'admin' and s.name = alvo
      )
$$;

-- Ninguém altera a PRÓPRIA loja, nível, grupo, permissões ou ativo pelo
-- navegador. O servidor (sem auth.uid()) continua podendo — é o gestor
-- fazendo via app. Primeiro cadastro (company nula) é liberado.
create or replace function public.bloquear_campos_sensiveis_profile() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if (old.company is not null and new.company is distinct from old.company)
       or new.access_level is distinct from old.access_level
       or new.grupo is distinct from old.grupo
       or new.permissions is distinct from old.permissions
       or new.active is distinct from old.active then
      raise exception 'Campo protegido: loja, nível e permissões só mudam pelo gestor.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bloquear_campos_sensiveis_profile on profiles;
create trigger trg_bloquear_campos_sensiveis_profile
  before update on profiles for each row execute function public.bloquear_campos_sensiveis_profile();

-- Recria as políticas das quatro tabelas do zero (apaga qualquer "allow_all")
do $$
declare t text; pol record;
begin
  foreach t in array array['profiles', 'vendas_atual', 'vendas_historico', 'estoque_payloads'] loop
    execute format('alter table %I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- profiles: a pessoa lê e edita só a própria linha (os demais campos
-- sensíveis são travados pelo trigger acima). Master lê todos.
create policy profiles_ler on profiles for select to authenticated
  using (id = auth.uid() or public.sou_master());
create policy profiles_editar_proprio on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- vendas: só da própria loja ou do grupo (leitura e escrita); master, todas.
create policy vendas_atual_loja on vendas_atual for all to authenticated
  using (public.loja_minha(company)) with check (public.loja_minha(company));
create policy vendas_historico_loja on vendas_historico for all to authenticated
  using (public.loja_minha(company)) with check (public.loja_minha(company));

-- estoque: leitura da própria loja (ou do grupo); gravação vai pelo servidor.
create policy estoque_payloads_ler on estoque_payloads for select to authenticated
  using (public.loja_minha(company));
