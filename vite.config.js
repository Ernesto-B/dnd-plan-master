import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The React app lives in client/. The existing Express server (unchanged API +
// the legacy-page bridge under /legacy) runs separately on :3000 during dev; we
// proxy backend paths to it. The production build emits to dist/client, which
// Express serves as the SPA.
export default defineConfig({
  root: 'client',
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
  },
});
