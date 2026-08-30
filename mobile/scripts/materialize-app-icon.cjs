'use strict';

/**
 * Bake the current flavor's business logo into Expo launcher / Play Store icons.
 * Source order: assets/flavors/<flavorKey>/icon.png, EXPO_PUBLIC_APP_ICON_URL,
 * mobile bootstrap logo, then initials on the brand color.
 */
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_APP_NAME,
  DEFAULT_PRIMARY,
  bootstrapUrl,
  flavorIconOverridePath,
  hexToRgb,
  initialsFromAppName,
  iosIconFlattenColor,
  isLocalApiBase,
  logoFromBootstrap,
  normalizeHexColor,
  pickIconSource,
  primaryColorFromBootstrap,
  shouldReuseCache,
} = require('./app-icon-utils.cjs');

const MOBILE_ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(MOBILE_ROOT, 'assets');
const GENERATED_DIR = path.join(ASSETS_DIR, 'generated');
const MANIFEST_PATH = path.join(MOBILE_ROOT, 'flavors', 'manifest.json');
const CACHE_PATH = path.join(GENERATED_DIR, '.source.json');

const ICON_SIZE = 1024;
const PLAY_STORE_SIZE = 512;
const ADAPTIVE_PAD = 0.22;
const FETCH_TIMEOUT_MS = 12_000;

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { flavors: [] };
  }
}

function selectedFlavor() {
  const flavorKey = process.env.EXPO_PUBLIC_FLAVOR_KEY ?? 'dev';
  const manifest = loadManifest();
  const entry = (manifest.flavors || []).find((row) => row.key === flavorKey);
  return {
    flavorKey,
    appName: process.env.EXPO_PUBLIC_APP_NAME ?? entry?.appName ?? DEFAULT_APP_NAME,
    primaryColor: normalizeHexColor(entry?.primaryColor, DEFAULT_PRIMARY),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  };
}

function generatedPaths(outputDir = GENERATED_DIR) {
  return {
    icon: path.join(outputDir, 'icon.png'),
    adaptiveIcon: path.join(outputDir, 'adaptive-icon.png'),
    splash: path.join(outputDir, 'splash.png'),
    playStoreIcon: path.join(outputDir, 'play-store-icon.png'),
  };
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(payload) {
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function filesExist(paths) {
  return Object.values(paths).every((file) => fs.existsSync(file));
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function loadBootstrap(flavor) {
  if (process.env.EXPO_PUBLIC_SKIP_ICON_FETCH === '1') return null;
  if (process.env.EAS_BUILD === 'true' && isLocalApiBase(flavor.apiBaseUrl)) return null;
  const url = bootstrapUrl(flavor.apiBaseUrl, flavor.flavorKey);
  if (!url) return null;
  return fetchJson(url);
}

function initialsSvg(initials, color, size) {
  const safe = String(initials || 'IE')
    .slice(0, 2)
    .replace(/[^A-Za-z0-9]/g, '');
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${color}"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="${Math.round(size * 0.38)}" fill="#ffffff">${safe}</text>
    </svg>`,
  );
}

async function resizeLogoAsIs(sharp, logoBuffer, size) {
  return sharp(logoBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function pngHasTransparency(sharp, buffer) {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function flattenOpaqueIcon(sharp, logoBuffer, size, flattenRgb) {
  return sharp(logoBuffer)
    .resize(size, size, { fit: 'contain', background: { ...flattenRgb, alpha: 0 } })
    .flatten({ background: flattenRgb })
    .removeAlpha()
    .png()
    .toBuffer();
}

async function writeIcons({ logoBuffer, primaryColor, initials, iosFlattenColor, outputDir }) {
  const sharp = require('sharp');
  const destDir = outputDir || GENERATED_DIR;
  fs.mkdirSync(destDir, { recursive: true });
  const paths = generatedPaths(destDir);
  const flattenHex = normalizeHexColor(iosFlattenColor, primaryColor);
  const flattenRgb = hexToRgb(flattenHex, primaryColor);

  let icon;
  let adaptive;
  if (logoBuffer) {
    adaptive = await resizeLogoAsIs(sharp, logoBuffer, ICON_SIZE);
    // Apple rejects / black-fills transparent App Icons. Flatten iOS + store icons only.
    if (await pngHasTransparency(sharp, adaptive)) {
      console.warn(`[customer-app] flattened iOS icon onto ${flattenHex} (source had transparency)`);
      icon = await flattenOpaqueIcon(sharp, logoBuffer, ICON_SIZE, flattenRgb);
    } else {
      icon = adaptive;
    }
  } else {
    icon = await sharp(initialsSvg(initials, primaryColor, ICON_SIZE)).png().toBuffer();
    const adaptiveMark = initialsSvg(initials, primaryColor, Math.round(ICON_SIZE * (1 - ADAPTIVE_PAD * 2)));
    adaptive = await sharp({
      create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: adaptiveMark, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  // Native splash never shows initials. Logo mark if we have one; otherwise a brand-color fill.
  const splash = logoBuffer
    ? adaptive
    : await sharp({
        create: { width: ICON_SIZE, height: ICON_SIZE, channels: 3, background: hexToRgb(primaryColor, primaryColor) },
      })
        .png()
        .toBuffer();

  await Promise.all([
    fs.promises.writeFile(paths.icon, icon),
    fs.promises.writeFile(paths.adaptiveIcon, adaptive),
    fs.promises.writeFile(paths.splash, splash),
    sharp(icon).resize(PLAY_STORE_SIZE, PLAY_STORE_SIZE).png().toFile(paths.playStoreIcon),
  ]);
  return paths;
}

async function materializeAppIcon(options = {}) {
  const flavor = selectedFlavor();
  const paths = generatedPaths();
  const overridePath = flavorIconOverridePath(ASSETS_DIR, flavor.flavorKey);
  const overrideExists = Boolean(overridePath && fs.existsSync(overridePath));

  let bootstrap = null;
  if (!overrideExists && !String(process.env.EXPO_PUBLIC_APP_ICON_URL || '').trim()) {
    try {
      bootstrap = await loadBootstrap(flavor);
    } catch (error) {
      console.warn(`[customer-app] icon bootstrap failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const source = pickIconSource({
    flavorKey: flavor.flavorKey,
    assetsDir: ASSETS_DIR,
    overrideExists,
    envIconUrl: process.env.EXPO_PUBLIC_APP_ICON_URL,
    bootstrapLogoUrl: logoFromBootstrap(bootstrap),
    apiBaseUrl: flavor.apiBaseUrl,
  });
  const primaryColor = bootstrap
    ? primaryColorFromBootstrap(bootstrap, flavor.primaryColor)
    : flavor.primaryColor;

  const alwaysRefresh =
    process.env.EAS_BUILD === 'true' ||
    options.force === true ||
    process.env.EXPO_PUBLIC_FORCE_APP_ICON === '1' ||
    process.argv.includes('--force');
  if (
    filesExist(paths) &&
    shouldReuseCache(readCache(), { flavorKey: flavor.flavorKey, sourceValue: source.value, alwaysRefresh })
  ) {
    return { ...paths, reused: true, source };
  }

  let logoBuffer = null;
  if (source.kind === 'override') {
    logoBuffer = fs.readFileSync(source.value);
  } else if (source.kind === 'url') {
    try {
      logoBuffer = await fetchBuffer(source.value);
    } catch (error) {
      console.warn(`[customer-app] icon download failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const flattenColor = iosIconFlattenColor(process.env.EXPO_PUBLIC_IOS_ICON_BACKGROUND, primaryColor);
  await writeIcons({
    logoBuffer,
    primaryColor,
    initials: initialsFromAppName(flavor.appName),
    iosFlattenColor: flattenColor,
  });
  // A failed URL download must not be cached, or the next start reuses a blank/initials splash.
  if (source.kind === 'url' && !logoBuffer) {
    try {
      fs.unlinkSync(CACHE_PATH);
    } catch {
      // no cache to clear
    }
  } else {
    writeCache({
      flavorKey: flavor.flavorKey,
      sourceKind: source.kind,
      sourceValue: source.value,
      primaryColor,
      iosFlattenColor: flattenColor,
      fetchedAt: Date.now(),
    });
  }
  console.warn(
    `[customer-app] wrote ${source.kind} icons for ${flavor.flavorKey} → ${path.relative(MOBILE_ROOT, GENERATED_DIR)}`,
  );
  return { ...paths, reused: false, source };
}

function materializeAppIconSync() {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [__filename], {
    cwd: MOBILE_ROOT,
    env: process.env,
    stdio: 'inherit',
    timeout: FETCH_TIMEOUT_MS + 15_000,
  });
  if (result.status !== 0 && !filesExist(generatedPaths())) {
    throw new Error('Failed to materialize customer app icons.');
  }
  return generatedPaths();
}

module.exports = {
  generatedPaths,
  materializeAppIcon,
  materializeAppIconSync,
  pngHasTransparency,
  writeIcons,
};

if (require.main === module) {
  materializeAppIcon()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.warn(`[customer-app] ${error instanceof Error ? error.message : error}`);
      process.exit(filesExist(generatedPaths()) ? 0 : 1);
    });
}
