// Ensure EXPO_PUBLIC_* from the repo-root `.env` are available at bundle time.
require('../../scripts/load-root-env.cjs').loadRootEnv();

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Workspace packages only — avoid watching monorepo node_modules on Windows.
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/sdk'),
  path.resolve(monorepoRoot, 'packages/i18n'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
