import { useRef, useState } from 'react';

// Ditado por voz (o mesmo do Listas e das Anotações, aqui como gancho
// reaproveitável). O navegador transcreve; nada de áudio sai do aparelho.
//
// `continuous`: relato do dia a dia costuma ter várias frases, e sem isso o
// navegador encerra na primeira pausa — a pessoa teria de tocar de novo a
// cada frase.
export function vozDisponivel() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// `aoTrecho(texto)` recebe cada trecho reconhecido, já sem espaços nas pontas.
// Quem chama decide onde encaixar — o padrão é ACRESCENTAR ao que já existe,
// nunca substituir: o ditado é ajuda, não pode apagar o que foi digitado.
export function useDitado(aoTrecho, { aoIndisponivel } = {}) {
  const [ouvindo, setOuvindo] = useState(false);
  const recRef = useRef(null);

  const ditar = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { aoIndisponivel?.(); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onstart = () => setOuvindo(true);
    rec.onend   = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    rec.onresult = (e) => {
      const trecho = e.results[e.results.length - 1][0].transcript.trim();
      if (trecho) aoTrecho(trecho);
    };
    recRef.current = rec;
    rec.start();
  };

  const parar = () => { try { recRef.current?.stop(); } catch { /* já parou */ } };

  return { ouvindo, ditar, parar };
}
