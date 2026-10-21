/**
 * Invoke Expo CLI and bake local Google OAuth IDs into EXPO_PUBLIC_*.
 * EAS production still uses eas.json; this file is local `expo start` only.
 */
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1';

require('../scripts/load-root-env.cjs').loadRootEnv();

const webClient = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
if (webClient && !(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '').trim()) {
  process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID = webClient;
}
const androidClient = (process.env.GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID || '').trim();
if (androidClient && !(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID || '').trim()) {
  process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID = androidClient;
}

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

function resolveExpoCli() {
  const roots = [projectRoot, monorepoRoot];
  for (const root of roots) {
    try {
      const resolveFrom = Module.createRequire(path.join(root, 'package.json'));
      return resolveFrom.resolve('expo/bin/cli');
    } catch {
      // try next root
    }
  }
  const fallbacks = [
    path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli'),
    path.join(monorepoRoot, 'node_modules', 'expo', 'bin', 'cli'),
  ];
  for (const candidate of fallbacks) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const expoCli = resolveExpoCli();
if (!expoCli) {
  console.error('[customer-app] Expo CLI is missing from node_modules. Run corepack pnpm install.');
  process.exit(1);
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.length === 0) {
  args.push('start');
}

const result = spawnSync(process.execPath, [expoCli, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: projectRoot,
  windowsHide: true,
});

process.exit(result.status ?? 1);
