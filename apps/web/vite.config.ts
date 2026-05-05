import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  // Load monorepo root .env so VITE_* and PORT match the API (apps/web has no .env by default).
  const env = loadEnv(mode, REPO_ROOT, '');
  const apiOrigin = (env.VITE_API_URL || `http://localhost:${env.PORT || '4000'}`).replace(
    /\/$/,
    '',
  );

  return {
  envDir: REPO_ROOT,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SmartLoad',
        short_name: 'SmartLoad',
        description: 'Barcode Verification & Dispatch Management System',
        theme_color: '#0F2044',
        background_color: '#0F2044',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: '/scan',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: apiOrigin, changeOrigin: true },
      '/socket.io': { target: apiOrigin, ws: true, changeOrigin: true },
    },
  },
  };
});
