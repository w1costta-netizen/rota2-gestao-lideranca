import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ─────────────────────────────────────────────────────────────
// ETIQUETA DE VERSÃO — uma por publicação.
//
// O app aberto numa aba não se atualiza sozinho: quem deixa o Rota Líder
// aberto o dia todo continua no código antigo até fechar e abrir. Uma
// correção publicada não chegava em ninguém — e quem reclamou do defeito
// continuava vendo o defeito, já resolvido.
//
// Cada build carimba a mesma etiqueta em dois lugares: DENTRO do código
// (`__VERSAO_APP__`) e num arquivo solto (`/version.json`). O app aberto
// compara os dois de tempos em tempos; se o arquivo do servidor diz outra
// coisa, saiu versão nova e aparece o aviso de "Atualizar".
//
// Na Netlify a etiqueta é o commit publicado (`COMMIT_REF`) — dá para saber
// exatamente qual versão cada um está rodando. Fora dela, a hora do build.
// ─────────────────────────────────────────────────────────────
const VERSAO_APP = (process.env.COMMIT_REF || '').slice(0, 7) || `local-${Date.now().toString(36)}`;

const etiquetaDeVersao = () => ({
  name: 'etiqueta-de-versao',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ versao: VERSAO_APP }),
    });
  },
});

export default defineConfig({
  plugins: [react(), etiquetaDeVersao()],
  define: {
    __VERSAO_APP__: JSON.stringify(VERSAO_APP),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'https://rota2-gestao-lideranca.onrender.com',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Konva fica no chunk lazy de Relatorios (já separado por React.lazy)
          if (id.includes('konva') || id.includes('react-konva')) return 'konva';
          // Supabase
          if (id.includes('@supabase')) return 'supabase';
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react';
          // Lucide icons (grande — tree-shake não é perfeito no barrel)
          if (id.includes('lucide-react')) return 'lucide';
        },
      },
    },
  },
});
