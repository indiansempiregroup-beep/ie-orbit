/**
 * Write mobile/credentials/google-services/<androidPackage>.json for EAS prebuild.
 * Package comes from EXPO_PUBLIC_FLAVOR_KEY + flavors/manifest.json.
 * Source (first match): existing file, GOOGLE_SERVICES_JSON (raw JSON or path),
 * or GOOGLE_SERVICES_JSON_BASE64.
 */
const fs = require('fs');
const path = require('path');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('../flavors/manifest.json');

function resolveAndroidPackage() {
  const flavorKey = (process.env.EXPO_PUBLIC_FLAVOR_KEY || 'dev').trim();
  const entry = manifest.flavors.find((item) => item.key === flavorKey);
  return entry?.bundleIdAndroid || 'com.ieorbit.mobile.dev';
}

function googleServicesDest(androidPackage) {
  const pkg = (androidPackage || resolveAndroidPackage()).trim();
  return path.join(__dirname, '..', 'credentials', 'google-services', `${pkg}.json`);
}

function writeJson(dest, text) {
  const parsed = JSON.parse(text);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(parsed, null, 2)}\n`);
  return dest;
}

function materializeGoogleServices(androidPackage) {
  const dest = googleServicesDest(androidPackage);
  if (fs.existsSync(dest)) return dest;

  const raw = (process.env.GOOGLE_SERVICES_JSON || '').trim();
  if (raw) {
    if (raw.startsWith('{')) return writeJson(dest, raw);
    if (fs.existsSync(raw)) return writeJson(dest, fs.readFileSync(raw, 'utf8'));
  }

  const encoded = (process.env.GOOGLE_SERVICES_JSON_BASE64 || '').trim();
  if (encoded) {
    return writeJson(dest, Buffer.from(encoded, 'base64').toString('utf8'));
  }

  return null;
}

module.exports = {
  resolveAndroidPackage,
  googleServicesDest,
  materializeGoogleServices,
};

if (require.main === module) {
  const androidPackage = resolveAndroidPackage();
  const file = materializeGoogleServices(androidPackage);
  if (!file) {
    console.warn(
      `[customer-app] google-services.json is missing for ${androidPackage}. Android push will not work until you add Firebase FCM. See mobile/credentials/README.md.`,
    );
    process.exit(0);
  }
  console.log(`[customer-app] using ${path.relative(process.cwd(), file)}`);
}
