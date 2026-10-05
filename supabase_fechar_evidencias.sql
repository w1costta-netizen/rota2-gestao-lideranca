-- ═══════════════════════════════════════════════════════════════
-- FECHAR O BALDE DAS EVIDÊNCIAS
--
-- ⚠️ RODE SÓ DEPOIS DA MIGRAÇÃO (Usuários → Manutenção → "Mover de
-- verdade"). Fechar antes deixa TODAS as fotos quebradas na tela,
-- porque os endereços antigos param de funcionar no mesmo instante.
--
-- O QUE ESTAVA ABERTO
-- `evidencias` era um balde PÚBLICO. Balde público é servido direto pela
-- internet — o Supabase nem consulta as regras. Qualquer pessoa, sem
-- login, com a chave pública (que viaja dentro do arquivo que o
-- navegador baixa) listava o balde e baixava as fotos de dentro da loja
-- de todos os clientes. Havia ainda uma regra deixando qualquer pessoa
-- logada SUBSTITUIR o arquivo de qualquer empresa.
--
-- Não dava para fechar só no banco: o caminho do arquivo não tinha a
-- loja (`relatorios/...`, `flyers/...`), então não existia nada para a
-- regra conferir. Por isso veio primeiro o código e a migração, que
-- põem tudo em `<loja>/...`.
-- ═══════════════════════════════════════════════════════════════


-- ══ PASSO 1 — CONFERIR QUE A MIGRAÇÃO ACABOU ════════════════
-- Tem que vir ZERO. Qualquer linha aqui é arquivo que ainda está no
-- caminho antigo e vai quebrar quando o balde fechar.
select 'relatorios.pdf_url'   as campo, count(*) as faltando from relatorios_fotograficos where pdf_url       like 'http%'
union all
select 'fotos.photo_url',             count(*) from relatorio_fotos        where photo_url     like 'http%'
union all
select 'fotos.evidencia_url',         count(*) from relatorio_fotos        where evidencia_url like 'http%'
union all
select 'campanhas.flyer_pdf_url',     count(*) from campanhas              where flyer_pdf_url like 'http%'
union all
select 'campanha_evidencias.foto_url',count(*) from campanha_evidencias    where foto_url      like 'http%';


-- ══ PASSO 2 — QUEM PODE ABRIR A PASTA DE UMA LOJA ═══════════
-- Mesma regra de `loja_minha` (própria loja, master, ou dono do grupo),
-- só que comparando a PASTA.
--
-- O `replace(nome, '/', '-')` existe porque uma barra no nome da loja
-- criaria uma pasta a mais e a loja perderia o próprio arquivo. ESTA
-- MESMA CONTA está em frontend/src/lib/arquivos.js e em
-- backend/lib/arquivos.js. São três lugares; se um mudar, muda nos três
-- — descasar aqui significa alguém sem acesso à própria foto.
create or replace function public.loja_minha_pasta(pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_master()
      or pasta = replace((select company from profiles where id = auth.uid()), '/', '-')
      or exists (
        select 1 from profiles p join stores s on s.grupo = p.grupo
        where p.id = auth.uid() and p.grupo is not null and p.access_level = 'admin'
          and replace(s.name, '/', '-') = pasta
      )
$$;


-- ══ PASSO 3 — TROCAR AS REGRAS DO BALDE ═════════════════════
drop policy if exists "leitura_evidencias"           on storage.objects;
drop policy if exists "public read evidencias"       on storage.objects;
drop policy if exists "auth users upload evidencias" on storage.objects;
drop policy if exists "auth users update evidencias" on storage.objects;

-- Ler: só quem é da loja dona da pasta.
create policy evidencias_ler on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and public.loja_minha_pasta((storage.foldername(name))[1]));

-- Gravar: só dentro da própria pasta.
create policy evidencias_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and public.loja_minha_pasta((storage.foldername(name))[1]));

-- Substituir: o app regera o PDF e salva a foto anotada por cima, então
-- isto é necessário. A diferença para antes é o DONO: antes qualquer
-- pessoa logada trocava o arquivo de qualquer empresa.
create policy evidencias_substituir on storage.objects for update to authenticated
  using      (bucket_id = 'evidencias' and public.loja_minha_pasta((storage.foldername(name))[1]))
  with check (bucket_id = 'evidencias' and public.loja_minha_pasta((storage.foldername(name))[1]));

-- Apagar continua sem regra: só o servidor, pela chave secreta.


-- ══ PASSO 4 — FECHAR O BALDE ════════════════════════════════
-- É isto que vale mais que todas as regras acima. Enquanto o balde é
-- público, elas nem são consultadas na leitura.
update storage.buckets set public = false where id = 'evidencias';


-- ══ PASSO 5 — CONFERIR ══════════════════════════════════════
select id, public as aberto_por_url from storage.buckets where id = 'evidencias';
-- aberto_por_url tem que ser FALSE.

select policyname, roles::text as vale_para, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
-- Nenhuma linha de evidencias pode aparecer com {public}.


-- ══ SE ALGO QUEBRAR ═════════════════════════════════════════
-- Reabrir é uma linha, e volta a exposição — use só para não deixar o
-- cliente sem as fotos enquanto a causa é investigada:
--   update storage.buckets set public = true where id = 'evidencias';
