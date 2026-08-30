'use strict';

const path = require('node:path');

const DEFAULT_PRIMARY = '#1A56DB';
const DEFAULT_APP_NAME = 'IE Orbit';
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;

function initialsFromAppName(name) {
  const parts = String(name || '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'IE';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function normalizeHexColor(color, fallback = DEFAULT_PRIMARY) {
  const trimmed = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function hexToRgb(color, fallback = '#ffffff') {
  const hex = normalizeHexColor(color, fallback).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** iOS app icons must be opaque. Transparent pixels flatten onto the brand color unless overridden. */
function iosIconFlattenColor(envValue, fallback = DEFAULT_PRIMARY) {
  return normalizeHexColor(envValue, fallback);
}

function apiOrigin(apiBaseUrl) {
  return String(apiBaseUrl || '')
    .trim()
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');
}

function resolveMediaUrl(url, apiBaseUrl) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = apiOrigin(apiBaseUrl);
  if (!origin) return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function unwrapBootstrap(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function logoFromBootstrap(payload) {
  const data = unwrapBootstrap(payload);
  const branding = data.branding && typeof data.branding === 'object' ? data.branding : {};
  const business = data.business && typeof data.business === 'object' ? data.business : {};
  return String(branding.logo || business.logo || branding.favicon || '').trim();
}

function primaryColorFromBootstrap(payload, fallback) {
  const data = unwrapBootstrap(payload);
  const branding = data.branding && typeof data.branding === 'object' ? data.branding : {};
  return normalizeHexColor(branding.primary_color, fallback);
}

function isLocalApiBase(apiBaseUrl) {
  return /localhost|127\.0\.0\.1/i.test(String(apiBaseUrl || ''));
}

function flavorIconOverridePath(assetsDir, flavorKey) {
  if (!flavorKey) return '';
  return path.join(assetsDir, 'flavors', flavorKey, 'icon.png');
}

function pickIconSource({
  flavorKey,
  assetsDir,
  overrideExists,
  envIconUrl,
  bootstrapLogoUrl,
  apiBaseUrl,
}) {
  if (overrideExists && flavorKey) {
    return { kind: 'override', value: flavorIconOverridePath(assetsDir, flavorKey) };
  }
  const explicit = String(envIconUrl || '').trim();
  if (explicit) {
    return { kind: 'url', value: resolveMediaUrl(explicit, apiBaseUrl) };
  }
  if (bootstrapLogoUrl) {
    return { kind: 'url', value: resolveMediaUrl(bootstrapLogoUrl, apiBaseUrl) };
  }
  return { kind: 'initials', value: '' };
}

function shouldReuseCache(cache, { flavorKey, sourceValue, alwaysRefresh, now = Date.now() }) {
  if (alwaysRefresh || !cache || typeof cache !== 'object') return false;
  if (cache.flavorKey !== flavorKey || cache.sourceValue !== sourceValue) return false;
  const fetchedAt = Number(cache.fetchedAt || 0);
  return fetchedAt > 0 && now - fetchedAt < CACHE_MAX_AGE_MS;
}

function bootstrapUrl(apiBaseUrl, flavorKey) {
  const base = String(apiBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  if (!base || !flavorKey) return '';
  return `${base}/mobile/bootstrap?flavor_key=${encodeURIComponent(flavorKey)}`;
}

module.exports = {
  CACHE_MAX_AGE_MS,
  DEFAULT_APP_NAME,
  DEFAULT_PRIMARY,
  apiOrigin,
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
  resolveMediaUrl,
  shouldReuseCache,
  unwrapBootstrap,
};
