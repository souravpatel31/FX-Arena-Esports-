import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const rawBase = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const publicSiteUrl = (env.VITE_PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const apkUrl = (env.VITE_APK_DOWNLOAD_URL || process.env.VITE_APK_DOWNLOAD_URL || '').trim();

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'fx-arena-html-urls',
        transformIndexHtml(html) {
          let updated = html;
          if (base !== '/') {
            updated = updated
              .replace(/href="\/manifest\.json"/g, `href="${base}manifest.json"`)
              .replace(/"\/assets\//g, `"${base}assets/`);
          }
          if (publicSiteUrl) {
            updated = updated.replace(/https:\/\/fx-arena-esports\.invalid/g, publicSiteUrl);
          } else {
            updated = updated
              .replace(/<link rel="canonical" href="https:\/\/fx-arena-esports\.invalid\/" \/>\s*/g, '')
              .replace(/<meta property="og:url" content="https:\/\/fx-arena-esports\.invalid\/" \/>\s*/g, '');
          }
          if (apkUrl) {
            updated = updated.replace(/https:\/\/fx-arena-esports\.invalid\/FX-Arena-Esports\.apk/g, apkUrl);
          }
          return updated;
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            vendor: ['react', 'react-dom', 'react-router-dom', 'motion', 'lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
