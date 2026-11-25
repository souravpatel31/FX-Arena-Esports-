import fs from 'fs';
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
  const appVersion = (env.VITE_APP_VERSION || process.env.VITE_APP_VERSION || '1.0.0').trim();
  const appBuildNumber = Number(env.VITE_APP_BUILD_NUMBER || process.env.VITE_APP_BUILD_NUMBER || 0) || 0;
  const appBuildId = (
    env.VITE_APP_BUILD_ID ||
    process.env.VITE_APP_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    String(Date.now())
  ).trim();
  const githubRepo = (
    env.VITE_GITHUB_REPO ||
    process.env.VITE_GITHUB_REPO ||
    'souravpatel31/FX-Arena-Esports-'
  ).trim();

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
      {
        name: 'fx-arena-version-manifest',
        writeBundle(options) {
          const outDir = options.dir || path.resolve(__dirname, 'dist');
          try {
            fs.mkdirSync(outDir, {recursive: true});
            fs.writeFileSync(
              path.join(outDir, 'version.json'),
              JSON.stringify(
                {
                  version: appVersion,
                  buildNumber: appBuildNumber,
                  buildId: appBuildId,
                  githubRepo,
                  updatedAt: new Date().toISOString(),
                },
                null,
                2
              )
            );
          } catch {
            // ignore write errors
          }
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_NUMBER__: JSON.stringify(appBuildNumber),
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
      __GITHUB_REPO__: JSON.stringify(githubRepo),
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
