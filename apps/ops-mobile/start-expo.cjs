/**
 * Invoke Expo CLI without PATH / pnpm `.bin` shims.
 *
 * Windows + hoisted pnpm installs often lose `.bin/expo` or leave @expo/cli
 * half-deleted mid-install. Resolving `expo/bin/cli` via Node and running it
 * with `process.execPath` avoids the recurring "expo not found" failure.
 *
 * Usage (via package.json):
 *   node ./start-expo.cjs start --port 8082
 *   node ./start-expo.cjs run:android
 */
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1';

require('../../scripts/load-root-env.cjs').loadRootEnv();

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

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

function failMissingExpo() {
  console.error(`
[ops-mobile] Expo CLI is missing from node_modules.

This usually means a broken/incomplete install (common on Windows with AV).
From the monorepo root, run:

  corepack pnpm install --filter @ie-platform/ops-mobile...

Then start again with:

  pnpm.cmd start -- --clear --lan
`);
  process.exit(1);
}

// Apply node_modules patches before Metro boots (no-ops if packages missing).
require('./scripts/patch-metro-windows.cjs');

const expoCli = resolveExpoCli();
if (!expoCli) {
  failMissingExpo();
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
