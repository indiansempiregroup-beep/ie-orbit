'use strict';

function resolvePublicSiteOrigin(input = {}) {
  const configured = String(input.configured ?? '')
    .trim()
    .replace(/\/$/, '');
  if (configured) return configured;
  const protocol = input.protocol || 'http:';
  const hostname = input.hostname || 'localhost';
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3000`;
  }
  if (hostname.startsWith('ops.')) {
    return `${protocol}//${hostname.slice('ops.'.length)}`;
  }
  if (hostname.startsWith('ops-')) {
    return `${protocol}//${hostname.slice('ops-'.length)}`;
  }
  return `${protocol}//${hostname}`;
}

module.exports = { resolvePublicSiteOrigin };
