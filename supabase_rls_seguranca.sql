-- ═══════════════════════════════════════════════════════════════
-- Segurança: RLS (Row Level Security) para profiles e vendas
-- ═══════════════════════════════════════════════════════════════
-- Hoje essas tabelas são consultadas DIRETO do navegador (sem passar
-- pelo backend), então o filtro por empresa que existe no código
-- JavaScript é só "cortesia" — não impede alguém de burlar via
-- DevTools. Este SQL fecha essa brecha no próprio banco.
--
-- IMPORTANTE: a política original usava tenant_id, uma coluna que
-- nunca foi preenchida corretamente na criação de lojas/usuários do
-- app (só existe nessa policy solta) — isso causou vazamento de dados
-- de vendas entre lojas diferentes (ex: Caxias do Sul via dados de
-- Sam's Club Recife), porque perfis novos ficavam com o mesmo
-- tenant_id (ou null) e a política deixava passar. Trocado para usar
-- profiles.company, que é o campo real do modelo multi-tenant do app.

-- 1) Função auxiliar: retorna a empresa (loja) do usuário logado.
--    SECURITY DEFINER evita recursão infinita (a política de RLS
--    de profiles não pode consultar profiles de novo através dela).
CREATE OR REPLACE FUNCTION my_company()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company FROM profiles WHERE id = auth.uid();
$$;

-- 2) PROFILES — cada usuário só vê e edita o PRÓPRIO perfil.
--    Criar/editar OUTROS perfis continua só pelo backend, que usa a
--    chave secreta (ignora RLS) e já confere permissão de admin.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3) VENDAS_ATUAL — só dados da própria loja (company)
ALTER TABLE vendas_atual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_atual_select" ON vendas_atual;
DROP POLICY IF EXISTS "vendas_atual_select_company" ON vendas_atual;
CREATE POLICY "vendas_atual_select_company" ON vendas_atual
  FOR SELECT TO authenticated USING (company = my_company());

DROP POLICY IF EXISTS "vendas_atual_insert" ON vendas_atual;
DROP POLICY IF EXISTS "vendas_atual_insert_company" ON vendas_atual;
CREATE POLICY "vendas_atual_insert_company" ON vendas_atual
  FOR INSERT TO authenticated WITH CHECK (company = my_company());

DROP POLICY IF EXISTS "vendas_atual_delete" ON vendas_atual;
DROP POLICY IF EXISTS "vendas_atual_delete_company" ON vendas_atual;
CREATE POLICY "vendas_atual_delete_company" ON vendas_atual
  FOR DELETE TO authenticated USING (company = my_company());

-- 4) VENDAS_HISTORICO — mesma regra
ALTER TABLE vendas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_historico_select" ON vendas_historico;
DROP POLICY IF EXISTS "vendas_historico_select_company" ON vendas_historico;
CREATE POLICY "vendas_historico_select_company" ON vendas_historico
  FOR SELECT TO authenticated USING (company = my_company());

DROP POLICY IF EXISTS "vendas_historico_insert" ON vendas_historico;
DROP POLICY IF EXISTS "vendas_historico_insert_company" ON vendas_historico;
CREATE POLICY "vendas_historico_insert_company" ON vendas_historico
  FOR INSERT TO authenticated WITH CHECK (company = my_company());

DROP POLICY IF EXISTS "vendas_historico_delete" ON vendas_historico;
DROP POLICY IF EXISTS "vendas_historico_delete_company" ON vendas_historico;
CREATE POLICY "vendas_historico_delete_company" ON vendas_historico
  FOR DELETE TO authenticated USING (company = my_company());
