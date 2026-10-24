import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X, Check } from 'lucide-react';

// LEITURA GUIADA (pedido do usuário, 24/10/2026).
//
// Quem toca no cartão "não lidos" do painel quer ler o que chegou, não
// procurar no meio da lista. A tela abre já no primeiro não lido, com uma
// barra embaixo ("1 de 5 não lidas · Próxima"): cada toque em Próxima marca
// o atual como lido e leva ao seguinte, até acabar.
//
// O painel deixa o pedido guardado (pedirGuia) e a tela o lê uma única vez
// ao abrir (lerPedidoGuia). Entrar pelo menu abre a tela normal, sem guia.
// Cada item da lista precisa de id={idDoGuia(item.id)} para o guia achá-lo.

const CHAVE = 'rota_guia_nao_lidos';

export function pedirGuia(tela) {
  try { sessionStorage.setItem(CHAVE, tela); } catch { /* sem guia */ }
}

export function lerPedidoGuia(tela) {
  try {
    if (sessionStorage.getItem(CHAVE) !== tela) return false;
    sessionStorage.removeItem(CHAVE);
    return true;
  } catch { return false; }
}

export const idDoGuia = (id) => `guia-${id}`;

// ativo    — a tela foi aberta pelo cartão do painel
// pronto   — a lista já carregou
// naoLidos — ids dos não lidos, na ordem da tela
// marcar   — a mesma função que a tela já usa para marcar como lido
// aoMostrar(id) — opcional: abrir o texto inteiro, por exemplo
export default function GuiaNaoLidos({ ativo, pronto, naoLidos, marcar, aoMostrar }) {
  // A fila é tirada UMA vez, quando a lista chega: marcar como lido tira o
  // item dos não lidos, e a contagem "2 de 5" não pode encolher no caminho.
  const [fila, setFila] = useState(null);
  const [pos, setPos] = useState(0);
  const [fechado, setFechado] = useState(false);
  const atual = useRef(null);

  useEffect(() => {
    if (ativo && pronto && fila === null) setFila([...naoLidos]);
  }, [ativo, pronto, fila, naoLidos]);

  const terminou = fila !== null && pos >= fila.length;

  // Leva ao item da vez e o destaca.
  useEffect(() => {
    if (!fila || terminou || fechado) return undefined;
    const id = fila[pos];
    aoMostrar?.(id);
    // Espera a tela desenhar (o "ver mais" aberto muda a altura).
    const t = setTimeout(() => {
      const el = document.getElementById(idDoGuia(id));
      if (!el) return;
      atual.current?.classList.remove('guia-atual');
      el.classList.add('guia-atual');
      atual.current = el;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(t);
  }, [fila, pos, terminou, fechado]);

  // Fim (ou fechou): tira o destaque; o aviso de "tudo lido" some sozinho.
  useEffect(() => {
    if (!terminou && !fechado) return undefined;
    atual.current?.classList.remove('guia-atual');
    atual.current = null;
    if (!terminou) return undefined;
    const t = setTimeout(() => setFechado(true), 3000);
    return () => clearTimeout(t);
  }, [terminou, fechado]);

  if (!ativo || !fila || fechado) return null;
  // Nada novo: a tela abre normal, sem barra.
  if (fila.length === 0) return null;

  const proxima = () => {
    marcar(fila[pos]);
    setPos(p => p + 1);
  };

  if (terminou) {
    return (
      <div className="guia-barra fim" role="status">
        <Check size={16}/> Tudo lido. Você está em dia!
      </div>
    );
  }

  const ultima = pos === fila.length - 1;
  return (
    <div className="guia-barra" role="region" aria-label="Leitura guiada">
      <span className="guia-conta">
        <strong>{pos + 1}</strong> de {fila.length} {fila.length === 1 ? 'não lida' : 'não lidas'}
      </span>
      <button className="btn btn-primary guia-proxima" onClick={proxima}>
        {ultima ? <>Concluir <Check size={15}/></> : <>Próxima <ChevronRight size={15}/></>}
      </button>
      <button className="guia-fechar" onClick={() => setFechado(true)}
        aria-label="Fechar a leitura guiada" title="Fechar">
        <X size={16}/>
      </button>
    </div>
  );
}
