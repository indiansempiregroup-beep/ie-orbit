/**
 * Write apps/ops-mobile/credentials/google-services.json for EAS prebuild.
 * Source (first match): existing file, GOOGLE_SERVICES_JSON (raw JSON or path),
 * or GOOGLE_SERVICES_JSON_BASE64.
 */
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'credentials', 'google-services.json');

function writeJson(text) {
  const parsed = JSON.parse(text);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(parsed, null, 2)}\n`);
  return dest;
}

function materializeGoogleServices() {
  if (fs.existsSync(dest)) return dest;

  const raw = (process.env.GOOGLE_SERVICES_JSON || '').trim();
  if (raw) {
    if (raw.startsWith('{')) return writeJson(raw);
    if (fs.existsSync(raw)) return writeJson(fs.readFileSync(raw, 'utf8'));
  }

  const encoded = (process.env.GOOGLE_SERVICES_JSON_BASE64 || '').trim();
  if (encoded) {
    return writeJson(Buffer.from(encoded, 'base64').toString('utf8'));
  }

  return null;
}

module.exports = { dest, materializeGoogleServices };

if (require.main === module) {
  const file = materializeGoogleServices();
  if (!file) {
    console.warn(
      '[ops-mobile] google-services.json is missing. Android push will not work until you add Firebase FCM. See mobile/credentials/README.md.',
    );
    process.exit(0);
  }
  console.log(`[ops-mobile] using ${path.relative(process.cwd(), file)}`);
}
