-- Categorias próprias do Diário de Bordo, criadas pela própria loja.
--
-- As 7 categorias base (resultado, operacao, clima, seguranca, equipe,
-- cliente, outro) continuam no código: toda loja nova já nasce com elas,
-- sem precisar de carga inicial. Esta tabela guarda só o que cada loja
-- acrescenta com o tempo.
--
-- É DA LOJA, não da pessoa. Se cada um criasse a sua, em pouco tempo
-- haveria "Chuva", "chuva" e "Tempo" como três coisas diferentes — e o
-- filtro, que é a razão de existir da categoria, pararia de agrupar.

create table if not exists diario_categorias (
  id         uuid primary key default gen_random_uuid(),
  company    text not null,

  -- Identificador sem acento nem espaço, gerado a partir do nome. É ele que
  -- fica gravado no relato, então nunca muda depois de criado: renomear a
  -- categoria não pode desligar os relatos que já a usam.
  chave      text not null,
  nome       text not null,
  cor        text not null default '#6b7280',

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Duas categorias com a mesma chave na mesma loja seriam exatamente o
  -- problema que este módulo evita.
  unique (company, chave)
);

create index if not exists idx_diario_categorias_company
  on diario_categorias(company);

alter table diario_categorias enable row level security;
