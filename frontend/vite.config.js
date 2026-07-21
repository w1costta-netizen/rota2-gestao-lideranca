import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
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
