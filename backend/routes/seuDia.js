const express   = require('express');
const router    = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { registrarLog } = require('../lib/auditLog');
const SeuDia = require('../lib/seuDia');

// "Seu dia em 30 segundos" — regras em lib/seuDia.js.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/seu-dia  { fatos }  →  { texto, ia }
router.post('/', async (req, res) => {
  const userId = req.usuario?.id;
  if (!userId) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });

  const fatos = SeuDia.limparFatos(req.body?.fatos);
  const reserva = () => res.json({ texto: SeuDia.fraseReserva(fatos), ia: false });
  if (!SeuDia.temAlgo(fatos)) return reserva();

  const chave = SeuDia.chaveDosFatos(fatos);
  const guardado = SeuDia.doCache(userId, chave);
  if (guardado) return res.json({ texto: guardado, ia: true });
  if (!SeuDia.podeGerar(userId)) return reserva();

  const pedido = SeuDia.montarPedido(fatos);
  try {
    // Haiku sem raciocínio: é só redigir fatos prontos, e roda a cada
    // abertura do app — rapidez e custo mínimo valem mais que profundidade.
    // (O Haiku não aceita `fallbacks`; se falhar, vai a frase pronta.)
    const resposta = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 1000,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: pedido.system,
      messages: [{ role: 'user', content: pedido.mensagem }],
    });
    const texto = resposta.stop_reason === 'end_turn'
      ? SeuDia.arrumarTexto(resposta.content.filter(b => b.type === 'text').map(b => b.text).join(''))
      : '';
    if (!texto) {
      registrarLog('seu_dia', 'profiles', 'erro', { user_id: userId, rota: req.originalUrl, erro: `sem texto (${resposta.stop_reason})` });
      return reserva();
    }
    SeuDia.guardar(userId, chave, texto);
    // Só o custo vai para o log, nunca o texto: é o dia da pessoa.
    registrarLog('seu_dia', 'profiles', 'sucesso', {
      user_id: userId, depois: { modelo: resposta.model, tokens_entrada: resposta.usage?.input_tokens, tokens_saida: resposta.usage?.output_tokens },
    });
    res.json({ texto, ia: true });
  } catch (e) {
    registrarLog('seu_dia', 'profiles', 'erro', { user_id: userId, rota: req.originalUrl, erro: `${e?.status || ''} ${e?.message || e}`.trim() });
    reserva();
  }
});

module.exports = router;
