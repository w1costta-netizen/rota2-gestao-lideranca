// Redução de imagem antes de enviar — usado no Flyers e no Chat.
//
// Fica num arquivo só porque é código sensível a memória e errar aqui
// derruba o app de quem tem celular simples. Duas cópias divergiriam.
// Reduz o tamanho da imagem liberando a original assim que possível.
//
// Uma foto de 12 megapixels ocupa ~48 MB abertos na memória. Em celular
// simples isso derruba a aba do navegador — e quem estava validando um
// flyer concluía que "só funciona pela câmera", porque a foto da câmera
// às vezes vem menor que a da galeria.
//
// createImageBitmap quando existe: permite fechar a imagem original na
// hora (close()), em vez de esperar o navegador recolher sozinho. Onde
// não existe, cai no caminho antigo, que continua funcionando.
const calcularTamanho = (w, h, maxW, maxH) => {
  if (w <= maxW && h <= maxH) return [w, h];
  const ratio = Math.min(maxW / w, maxH / h);
  return [Math.round(w * ratio), Math.round(h * ratio)];
};

const paraJpeg = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao comprimir imagem')), 'image/jpeg', quality));

export const comprimirImagem = async (file, maxW = 1000, maxH = 1000, quality = 0.75) => {
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      // Arquivo grande: pede ao navegador para JÁ decodificar reduzido.
      // Sem isto, mesmo comprimindo antes da prévia, o aparelho abre a
      // foto inteira uma vez — e é esse pico que derruba celular com
      // pouca memória (relato real: erro de memória e o app voltando
      // sozinho para a tela inicial ao salvar a foto de um flyer).
      //
      // O limite por tamanho de arquivo evita ampliar foto pequena: um
      // JPEG acima de 3 MB é, na prática, sempre mais largo que maxW.
      // Onde o navegador ignora estas opções, ele devolve no tamanho
      // original e o passo seguinte reduz como antes.
      const grande = file.size > 3 * 1024 * 1024;
      bitmap = grande
        ? await createImageBitmap(file, { resizeWidth: maxW, resizeQuality: 'medium' })
        : await createImageBitmap(file);
      const [w, h] = calcularTamanho(bitmap.width, bitmap.height, maxW, maxH);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      bitmap.close();       // devolve a memória da original agora
      bitmap = null;
      return await paraJpeg(canvas, quality);
    } catch (e) {
      if (bitmap) { try { bitmap.close(); } catch { /* nada */ } }
      // Formato que o navegador não decodifica por aqui (HEIC em alguns
      // aparelhos): tenta o caminho antigo antes de desistir.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const [w, h] = calcularTamanho(img.width, img.height, maxW, maxH);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      img.src = '';         // solta a original antes de gerar o arquivo
      paraJpeg(canvas, quality).then(resolve, reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
};
