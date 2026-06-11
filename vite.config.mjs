import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The React app lives in client/. The existing Express server (unchanged API +
// the legacy-page bridge under /legacy) runs separately on :3000 during dev; we
// proxy backend paths to it. The production build emits to dist-client, which
// Express serves as the SPA.
export default defineConfig({
  root: 'client',
  // Point Vite's public directory at the project-root public/ folder so that
  // absolute paths like /fonts/*.woff2 and /js/*.js are known at build time.
  // This suppresses the "referenced … didn't resolve at build time" font
  // warnings and the "<script src=/js/…> can't be bundled" script warnings
  // (Vite skips both when the file is recognised as a public asset).
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Allow importing the shared stylesheet/fonts that live outside client/.
      allow: [path.resolve(__dirname)],
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/vendor': 'http://localhost:3000',
      '/legacy': 'http://localhost:3000',
      // style.css @font-face rules reference /fonts/*.woff2 (served by Express).
      '/fonts': 'http://localhost:3000',
      // Shared vanilla helpers reused by ported pages (dialog, tags, wiki-links,
      // connections-panel, export-dialog) are loaded as classic scripts from /js.
      '/js': 'http://localhost:3000',
    },
  },
  build: {
    // Sibling of electron-builder's dist/ output (don't nest inside it).
    outDir: path.resolve(__dirname, 'dist-client'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split vendor libraries into a separate chunk so the main app chunk
        // stays well under the 500 kB threshold after route-level lazy loading.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
