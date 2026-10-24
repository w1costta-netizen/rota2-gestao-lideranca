// O cartão "Tours pendentes" do painel deixa aqui o que a tela do Tour 4x4
// deve abrir: { id } abre aquele tour; { lista: 'para_mim' | 'enviados' }
// abre a lista no que está em aberto. A tela lê uma vez só.
const CHAVE = 'rota_abrir_tour';

export function pedirTour(pedido) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(pedido)); } catch { /* abre a lista */ }
}

export function lerPedidoTour() {
  try {
    const v = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
