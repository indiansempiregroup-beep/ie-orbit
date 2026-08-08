/**
 * Apply Windows Metro fixes into node_modules (idempotent).
 *
 * Expo CLI (when installed outside apps/ops-mobile) adds the monorepo root to
 * Metro watchFolders via `path.join(pkg, '../..')`, which crawls all of
 * node_modules. On Windows the Node FallbackWatcher then crashes with ENOENT
 * when directories disappear mid-crawl (AV / install races).
 */
const fs = require('fs');
const path = require('path');

const monorepoRoot = path.resolve(__dirname, '../../..');

function patchFile(filePath, marker, apply) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-metro-windows] skip missing ${filePath}`);
    return false;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes(marker)) return false;
  const next = apply(original);
  if (next === original) {
    console.warn(`[patch-metro-windows] pattern not found in ${filePath}`);
    return false;
  }
  fs.writeFileSync(filePath, next);
  console.log(`[patch-metro-windows] patched ${path.relative(monorepoRoot, filePath)}`);
  return true;
}

function patchExpoWatchFolders() {
  const target = path.join(
    monorepoRoot,
    'node_modules/@expo/cli/build/src/start/server/metro/withMetroMultiPlatform.js',
  );
  if (!fs.existsSync(target)) {
    console.warn(`[patch-metro-windows] skip missing ${target}`);
    return false;
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes('IE_METRO_WATCH_PACKAGES_ONLY')) return false;

  // Already converted to dirname() in a prior run — just stamp the marker.
  if (
    src.includes("dirname(require.resolve('metro-runtime/package.json'))") &&
    src.includes("dirname(require.resolve('@expo/metro-config/package.json'))")
  ) {
    src = src.replace(
      "dirname(require.resolve('metro-runtime/package.json')));",
      "dirname(require.resolve('metro-runtime/package.json'))); // IE_METRO_WATCH_PACKAGES_ONLY",
    );
    fs.writeFileSync(target, src);
    console.log(`[patch-metro-windows] marked ${path.relative(monorepoRoot, target)}`);
    return true;
  }

  return patchFile(target, 'IE_METRO_WATCH_PACKAGES_ONLY', (input) =>
    input
      .replace(
        "config.watchFolders.push(_path().default.join(require.resolve('metro-runtime/package.json'), '../..'));",
        "config.watchFolders.push(_path().default.dirname(require.resolve('metro-runtime/package.json'))); // IE_METRO_WATCH_PACKAGES_ONLY",
      )
      .replace(
        "config.watchFolders.push(_path().default.join(require.resolve('@expo/metro-config/package.json'), '../..'), // For virtual modules\n        _path().default.join(require.resolve('expo/package.json'), '..'));",
        "config.watchFolders.push(_path().default.dirname(require.resolve('@expo/metro-config/package.json')), // IE_METRO_WATCH_PACKAGES_ONLY virtual modules\n        _path().default.dirname(require.resolve('expo/package.json')));",
      ),
  );
}

function patchFallbackWatcher() {
  const target = path.join(
    monorepoRoot,
    'node_modules/metro-file-map/src/watchers/FallbackWatcher.js',
  );
  return patchFile(target, 'IE_ENOENT_GUARD', (src) =>
    src.replace(
      `_watchdir = (dir) => {
    if (this.watched[dir]) {
      return false;
    }
    const watcher = _fs.default.watch(
      dir,
      {
        persistent: true,
      },
      (event, filename) => this._normalizeChange(dir, event, filename),
    );
    this.watched[dir] = watcher;
    watcher.on("error", this._checkedEmitError);
    if (this.root !== dir) {
      this._register(dir, "d");
    }
    return true;
  };`,
      `_watchdir = (dir) => {
    // IE_ENOENT_GUARD — Windows can race-delete dirs during crawl
    if (this.watched[dir]) {
      return false;
    }
    let watcher;
    try {
      watcher = _fs.default.watch(
        dir,
        {
          persistent: true,
        },
        (event, filename) => this._normalizeChange(dir, event, filename),
      );
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "EPERM")) {
        return false;
      }
      throw error;
    }
    this.watched[dir] = watcher;
    watcher.on("error", this._checkedEmitError);
    if (this.root !== dir) {
      this._register(dir, "d");
    }
    return true;
  };`,
    ),
  );
}

function main() {
  patchExpoWatchFolders();
  patchFallbackWatcher();
}

main();
