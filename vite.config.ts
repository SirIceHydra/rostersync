import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    /** Browser talks to Vite; Vite forwards /api/* to the gateway (avoids CORS & wrong-port mistakes). */
    const gatewayProxy = env.VITE_GATEWAY_PROXY_TARGET || 'http://127.0.0.1:4000';
    return {
      server: {
        port: 3000,
        strictPort: false,
        proxy: {
          '/api': {
            target: gatewayProxy,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        /**
         * Empty/unset VITE_API_URL in dev → API client uses same-origin `/api/...` (see server.proxy).
         * Set VITE_API_URL explicitly if you want to bypass the proxy (e.g. remote gateway).
         */
        'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
