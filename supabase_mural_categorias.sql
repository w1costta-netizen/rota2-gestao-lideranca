-- Tipos de informação próprios do Mural, criados pela própria empresa.
--
-- Os 4 tipos base (meta, regra, lembrete, geral) continuam no código: toda
-- empresa nova já nasce com eles. Esta tabela guarda só o que cada empresa
-- acrescenta, na linguagem dela ("Segurança", "Campanha do mês"...).
--
-- É DA EMPRESA, não da pessoa, e só o administrador (o líder que comprou o
-- acesso) ou o master cria e remove. Mesmo modelo de diario_categorias.

create table if not exists mural_categorias (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,

  -- Identificador sem acento nem espaço, gerado do nome. É ele que fica
  -- gravado no card (mural.category), então nunca muda: renomear o tipo não
  -- pode desligar os cards que já o usam.
  chave      text not null,
  nome       text not null,
  cor        text not null default '#5F5E5A',

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  unique (company, chave)
);

create index if not exists idx_mural_categorias_company
  on mural_categorias(company);

alter table mural_categorias enable row level security;
