import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // dist.zip (u otro build empaquetado) puede quedar bloqueado por el
    // antivirus o un visor externo; sin esto, un EBUSY ahí tumba todo el
    // servidor de desarrollo.
    watch: { ignored: ['**/dist/**', '**/*.zip'] }
  },
  build: { target: 'es2020', outDir: 'dist', assetsDir: 'assets' }
});
