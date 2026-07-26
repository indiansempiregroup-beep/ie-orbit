/**
 * Load the monorepo-root `.env` into process.env (does not override existing vars).
 * Used by Vite (via envDir) peers: Expo app.config / metro so all apps share one file.
 */
const fs = require('fs');
const path = require('path');

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadRootEnv(fromDir = __dirname) {
  const envPath = path.resolve(fromDir, '..', '.env');
  if (!fs.existsSync(envPath)) return envPath;

  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    process.env[key] = stripQuotes(line.slice(eq + 1).trim());
  }

  // Optional single Places key → fill both frontend prefixes when unset.
  const places = process.env.GOOGLE_PLACES_API_KEY;
  if (places) {
    if (process.env.VITE_GOOGLE_PLACES_API_KEY === undefined) {
      process.env.VITE_GOOGLE_PLACES_API_KEY = places;
    }
    if (process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY === undefined) {
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = places;
    }
  }

  return envPath;
}

module.exports = { loadRootEnv };
