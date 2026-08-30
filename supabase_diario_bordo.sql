-- Módulo "Diário de Bordo" (Comunicação) — relatos do dia a dia da loja.
--
-- Diferente de Mural e Comunicados: aqui não é aviso nem comunicação oficial,
-- é o registro do que aconteceu naquele dia. Serve para consulta e análise
-- depois — entender por que a venda caiu, quando choveu, o que quebrou.
--
-- É da LOJA, não pessoal: todo mundo da loja lê e escreve.
-- Acesso exclusivamente pelo backend (service role), então RLS fica ligado
-- e SEM policies — mesmo padrão de listas/anotacoes/mural.

create table if not exists diario_bordo (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,
  user_id    uuid not null references profiles(id) on delete cascade,

  -- O dia a que o relato SE REFERE, separado de created_at: é comum
  -- registrar hoje algo que aconteceu ontem, e a análise depois precisa da
  -- data do fato, não da data em que alguém digitou.
  data       date not null,
  -- Hora aproximada do fato. Opcional: nem todo relato tem hora ("choveu a
  -- tarde toda"), e exigir hora faria a pessoa inventar um número.
  hora       time,

  categoria  text not null default 'outro',
  texto      text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A consulta principal é sempre "os relatos desta loja neste período",
-- do mais recente para o mais antigo. O índice acompanha essa ordem.
create index if not exists idx_diario_company_data
  on diario_bordo(company, data desc, created_at desc);

-- Filtrar por categoria é o que torna a análise possível ("me mostre todos
-- os dias com ocorrência de segurança"), então tem índice próprio.
create index if not exists idx_diario_categoria
  on diario_bordo(company, categoria);

alter table diario_bordo enable row level security;
