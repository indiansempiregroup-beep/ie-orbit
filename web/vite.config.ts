import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require('../scripts/load-root-env.cjs').loadRootEnv();

function resolveApiProxyTarget(env: Record<string, string>) {
  const fromEnv = (env.VITE_DEV_API_PROXY || process.env.VITE_DEV_API_PROXY || '').trim();
  if (fromEnv) return fromEnv;
  // Docker Compose service DNS only works inside the compose network.
  return fs.existsSync('/.dockerenv') ? 'http://backend:8000' : 'http://127.0.0.1:8000';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const places = env.GOOGLE_PLACES_API_KEY || env.VITE_GOOGLE_PLACES_API_KEY || '';
  const apiProxyTarget = resolveApiProxyTarget(env);

  return {
    plugins: [react()],
    // Single monorepo `.env` at repo root (shared with backend / Expo apps).
    envDir: repoRoot,
    resolve: {
      // Explicit aliases avoid Windows/Docker junction issues for workspace packages.
      alias: {
        '@ie-platform/i18n': path.resolve(repoRoot, 'packages/i18n/src/index.ts'),
        '@ie-platform/sdk': path.resolve(repoRoot, 'packages/sdk/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      fs: {
        allow: [repoRoot],
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/media': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    define: places
      ? {
          'import.meta.env.VITE_GOOGLE_PLACES_API_KEY': JSON.stringify(places),
        }
      : undefined,
  };
});
