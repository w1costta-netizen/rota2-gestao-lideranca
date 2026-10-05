const supabase = require('../supabase');

// ─────────────────────────────────────────────────────────────
// ARQUIVOS DE EVIDÊNCIA — fotos de dentro da loja e PDFs de relatório.
//
// O espaço é FECHADO. O banco guarda o CAMINHO do arquivo, nunca um
// endereço de internet; quem transforma caminho em link é o servidor,
// aqui, depois de já ter conferido de quem é o dado.
//
// Antes o balde era aberto e o banco guardava o link permanente: com a
// chave pública (que viaja dentro do arquivo que o navegador baixa)
// qualquer pessoa, sem login, listava o balde e baixava as fotos de
// dentro da loja de todos os clientes. Guardar o link no banco era o que
// tornava isso impossível de fechar sem mexer no app.
//
// Mesmo desenho já usado nos anexos do chat (routes/chat.js).
// ─────────────────────────────────────────────────────────────

const BALDE = 'evidencias';
const VALIDADE = 60 * 60; // 1 hora: sobra para ver, girar e baixar

// Pasta da loja, dentro do balde. ESTA CONTA É FEITA EM TRÊS LUGARES e
// precisa dar o mesmo resultado nos três: aqui, em frontend/src/lib/
// arquivos.js e na política do banco (supabase_fechar_evidencias.sql).
// Por isso ela é a mais boba possível — só a barra sai, porque barra
// criaria uma pasta a mais e a loja perderia o próprio arquivo. Nada de
// acento, maiúscula ou espaço: qualquer conversa mais esperta entre
// JavaScript e SQL descasaria algum dia, e descasar aqui significa alguém
// sem acesso à própria foto.
function pastaDaLoja(company) {
  return String(company || '').replace(/\//g, '-');
}

// Arquivo da época do balde aberto: o banco guardou o endereço inteiro.
// Enquanto a migração não roda, ele continua sendo devolvido como está —
// é o que deixa este código subir sem quebrar nada e sem depender da
// ordem do deploy.
const ehEnderecoAntigo = (v) => typeof v === 'string' && /^https?:\/\//.test(v);

const ehCaminho = (v) => typeof v === 'string' && v !== '' && !ehEnderecoAntigo(v);

// Percorre o que vai ser devolvido e troca, nos campos indicados, o
// caminho guardado por um link temporário. Funciona em objeto solto, em
// lista e no que vem aninhado (as fotos dentro do relatório), porque os
// campos de arquivo moram em níveis diferentes conforme a rota.
async function assinar(dados, campos) {
  if (!dados) return dados;
  const alvo = new Set(campos);
  const caminhos = new Set();

  const varrer = (no, aplicar) => {
    if (!no || typeof no !== 'object') return;
    if (Array.isArray(no)) { no.forEach(x => varrer(x, aplicar)); return; }
    for (const [k, v] of Object.entries(no)) {
      if (alvo.has(k) && ehCaminho(v)) aplicar(no, k, v);
      else if (v && typeof v === 'object') varrer(v, aplicar);
    }
  };

  varrer(dados, (_o, _k, v) => caminhos.add(v));
  if (!caminhos.size) return dados;

  const lista = [...caminhos];
  // Um pedido só para todos os arquivos: um relatório tem dezenas de
  // fotos, e assinar uma a uma deixava a tela lenta de um jeito que a
  // pessoa sente.
  const { data, error } = await supabase.storage.from(BALDE)
    .createSignedUrls(lista, VALIDADE);
  if (error) return dados;   // sem link, a tela mostra o espaço vazio — não quebra

  const mapa = new Map();
  (data || []).forEach((r, i) => { if (r?.signedUrl) mapa.set(lista[i], r.signedUrl); });
  varrer(dados, (o, k, v) => { if (mapa.has(v)) o[k] = mapa.get(v); });
  return dados;
}

module.exports = { BALDE, VALIDADE, pastaDaLoja, assinar, ehEnderecoAntigo };
