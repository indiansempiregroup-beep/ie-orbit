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
  const places = env.VITE_GOOGLE_PLACES_API_KEY || env.GOOGLE_PLACES_API_KEY || '';
  const googleOAuthClientId =
    env.VITE_GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID || '';
  const opsWebUrl = (env.VITE_OPS_MOBILE_WEB_URL || process.env.VITE_OPS_MOBILE_WEB_URL || '').trim();
  const publicSiteUrl = (env.VITE_PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || '').trim();
  const adminAppUrl = (env.VITE_ADMIN_APP_URL || process.env.VITE_ADMIN_APP_URL || '').trim();
  const apiProxyTarget = resolveApiProxyTarget(env);

  return {
    plugins: [react()],
    // Single monorepo `.env` at repo root (shared with backend / Expo apps).
    envDir: repoRoot,
    resolve: {
      // Explicit aliases avoid Windows/Docker junction issues for workspace packages.
      alias: {
        '@ie-orbit/i18n': path.resolve(repoRoot, 'packages/i18n/src/index.ts'),
        '@ie-orbit/sdk': path.resolve(repoRoot, 'packages/sdk/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      headers: {
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
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
    define: {
      ...(places
        ? { 'import.meta.env.VITE_GOOGLE_PLACES_API_KEY': JSON.stringify(places) }
        : {}),
      ...(googleOAuthClientId
        ? { 'import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID': JSON.stringify(googleOAuthClientId) }
        : {}),
      ...(opsWebUrl
        ? { 'import.meta.env.VITE_OPS_MOBILE_WEB_URL': JSON.stringify(opsWebUrl) }
        : {}),
      ...(publicSiteUrl
        ? { 'import.meta.env.VITE_PUBLIC_SITE_URL': JSON.stringify(publicSiteUrl) }
        : {}),
      ...(adminAppUrl
        ? { 'import.meta.env.VITE_ADMIN_APP_URL': JSON.stringify(adminAppUrl) }
        : {}),
    },
  };
});
