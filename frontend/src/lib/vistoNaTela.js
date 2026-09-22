import { useEffect, useRef } from 'react';

// "Apareceu na tela e ficou" = a pessoa leu.
//
// No Mural e no Diário o texto inteiro está no cartão: não há nada para
// abrir. Exigir um clique para marcar como lido fazia o contador nunca
// baixar — a pessoa lia tudo, saía da tela e o painel continuava dizendo
// "10 não lidos". Aqui o que conta é o que de fato ficou visível por
// alguns segundos, que é o mais perto de "li isto" que a tela consegue
// saber.
//
// Onde o conteúdo vem cortado (o "ver mais" dos comunicados), continua
// valendo o clique: ali aparecer na tela não é ter lido.
export function useVistoNaTela(marcar, { segundos = 2, visivel = 0.5 } = {}) {
  const marcarRef = useRef(marcar);
  marcarRef.current = marcar;
  const relogios = useRef(new Map());
  const observador = useRef(null);

  useEffect(() => {
    // Navegador antigo sem IntersectionObserver: segue sem marcar sozinho,
    // o clique continua funcionando.
    if (typeof IntersectionObserver === 'undefined') return undefined;
    observador.current = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const id = e.target.dataset.vistoId;
        if (!id) continue;
        if (e.isIntersecting) {
          if (relogios.current.has(id)) continue;
          relogios.current.set(id, setTimeout(() => {
            relogios.current.delete(id);
            marcarRef.current?.(id);
          }, segundos * 1000));
        } else {
          clearTimeout(relogios.current.get(id));
          relogios.current.delete(id);
        }
      }
    }, { threshold: visivel });

    const obs = observador.current;
    const contadores = relogios.current;
    return () => {
      obs.disconnect();
      contadores.forEach(t => clearTimeout(t));
      contadores.clear();
    };
  }, [segundos, visivel]);

  // Vai no elemento do cartão: ref={observar(item.id)}
  return (id) => (node) => {
    if (!node || !observador.current) return;
    node.dataset.vistoId = id;
    observador.current.observe(node);
  };
}
