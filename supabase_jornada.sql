-- ─────────────────────────────────────────────────────────────
-- Horário de trabalho (Etapa 1): vínculo usuário ↔ linha da escala,
-- isenção por pessoa e configuração por loja.
-- Idempotente: pode rodar mais de uma vez.
-- ─────────────────────────────────────────────────────────────

-- Cada usuário do app aponta para a SUA linha da escala (team_members).
-- Sem esse vínculo o app não sabe o turno da pessoa.
alter table profiles add column if not exists jornada_membro_id uuid references team_members(id) on delete set null;
-- Isento de horário (cargo de confiança): decisão do admin, registrada no log.
alter table profiles add column if not exists jornada_isento boolean not null default false;
-- Uma linha da escala pertence a no máximo um usuário.
create unique index if not exists idx_profiles_jornada_membro on profiles(jornada_membro_id) where jornada_membro_id is not null;

-- Por loja: a função começa desligada; tolerância nas pontas do turno.
alter table stores add column if not exists jornada_ativa boolean not null default false;
alter table stores add column if not exists jornada_tolerancia_min int not null default 15;

-- Ninguém se isenta nem troca o próprio vínculo pelo navegador: entra na
-- mesma trava de loja/nível/permissões. O servidor (sem auth.uid()) segue
-- podendo — é o gestor fazendo pelo app.
create or replace function public.bloquear_campos_sensiveis_profile() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if (old.company is not null and new.company is distinct from old.company)
       or new.access_level is distinct from old.access_level
       or new.grupo is distinct from old.grupo
       or new.permissions is distinct from old.permissions
       or new.active is distinct from old.active
       or new.jornada_membro_id is distinct from old.jornada_membro_id
       or new.jornada_isento is distinct from old.jornada_isento then
      raise exception 'Campo protegido: loja, nível, permissões e horário só mudam pelo gestor.';
    end if;
  end if;
  return new;
end $$;
