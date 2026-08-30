-- Módulo "Conversas" (Comunicação) — chat entre duas pessoas da mesma loja.
--
-- Acesso exclusivamente pelo backend (service role), então RLS fica ligado e
-- SEM policies. Isso é deliberado: abrir a tabela para o navegador ler
-- direto (necessário para conexão em tempo real) criaria justamente o tipo
-- de brecha que já causou vazamento entre lojas neste app.

-- Uma linha por PAR de pessoas. Guardar aqui a última mensagem e o número de
-- não lidas evita varrer todas as mensagens só para montar a lista de
-- conversas — que é a tela aberta com mais frequência.
create table if not exists conversas (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,

  -- Sempre gravados em ordem (usuario_a < usuario_b). É o que garante uma
  -- única conversa por par, independente de quem começou.
  usuario_a  uuid not null references profiles(id) on delete cascade,
  usuario_b  uuid not null references profiles(id) on delete cascade,

  ultima_texto text,
  ultima_de    uuid references profiles(id) on delete set null,
  ultima_em    timestamptz,

  -- Não lidas de cada lado. Guardado aqui para a lista mostrar o número sem
  -- precisar contar mensagens a cada abertura.
  nao_lidas_a int not null default 0,
  nao_lidas_b int not null default 0,

  created_at timestamptz not null default now(),

  unique (usuario_a, usuario_b),
  -- Barreira contra conversa consigo mesmo e contra par fora de ordem, que
  -- driblaria o unique acima e criaria conversa duplicada.
  check (usuario_a < usuario_b)
);

create index if not exists idx_conversas_a on conversas(usuario_a, ultima_em desc);
create index if not exists idx_conversas_b on conversas(usuario_b, ultima_em desc);

create table if not exists mensagens (
  id         uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  de_id      uuid not null references profiles(id) on delete cascade,
  texto      text not null,
  created_at timestamptz not null default now()
);

-- A tela busca sempre "as mensagens desta conversa em ordem de tempo", e a
-- cada poucos segundos só as mais novas que a última já exibida.
create index if not exists idx_mensagens_conversa
  on mensagens(conversa_id, created_at);

alter table conversas enable row level security;
alter table mensagens enable row level security;
