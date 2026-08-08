// Ensure EXPO_PUBLIC_* from the repo-root `.env` are available at bundle time.
require('../../scripts/load-root-env.cjs').loadRootEnv();

// Keep Expo CLI from auto-watching the monorepo root (huge Windows crawl of
// apps/, backend/, etc.). We only watch the folders Metro must resolve.
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = '1';

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const monorepoNodeModules = path.resolve(monorepoRoot, 'node_modules');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Workspace packages + hoisted deps. Metro will not resolve files outside
// projectRoot/watchFolders even if nodeModulesPaths lists them.
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages/sdk'),
  path.resolve(monorepoRoot, 'packages/i18n'),
  monorepoNodeModules,
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  monorepoNodeModules,
];
config.resolver.disableHierarchicalLookup = true;

// Ignore paths that commonly disappear mid-crawl on Windows installs.
// Use a plain RegExp (avoid metro-config/exclusionList ESM import issues on Windows).
config.resolver.blockList = [
  /[\\/]\.git([\\/]|$)/,
  /[\\/]\.github([\\/]|$)/,
  /[\\/][^\\/]*_tmp_\d+([\\/]|$)/,
  /[\\/]react-native_tmp_\d+([\\/]|$)/,
  /[\\/]__tests__([\\/]|$)/,
  /[\\/]android[\\/]build([\\/]|$)/,
  /[\\/]\.cxx([\\/]|$)/,
];

module.exports = config;
