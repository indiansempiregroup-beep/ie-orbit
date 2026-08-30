'use strict';

function googleReversedClientScheme(clientId) {
  const raw = String(clientId || '').trim();
  if (!raw) return '';
  const id = raw.replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!id || id === raw) return '';
  return `com.googleusercontent.apps.${id}`;
}

function isNativeGoogleAuthPlatform(platform) {
  return platform === 'ios' || platform === 'android';
}

function googleNativeRedirectUri({ androidClientId, applicationId } = {}) {
  const reversed = googleReversedClientScheme(androidClientId);
  if (reversed) return `${reversed}:/oauthredirect`;
  const appId = String(applicationId || '').trim();
  return appId ? `${appId}:/oauthredirect` : '';
}

function googleAuthSchemes({ appSlug, applicationId, androidClientId } = {}) {
  const schemes = [];
  const slug = String(appSlug || '').trim();
  const pkg = String(applicationId || '').trim();
  const reversed = googleReversedClientScheme(androidClientId);
  if (slug) schemes.push(slug);
  if (pkg && !schemes.includes(pkg)) schemes.push(pkg);
  if (reversed && !schemes.includes(reversed)) schemes.push(reversed);
  return schemes;
}

function shouldForceImplicitIdToken(platform) {
  return !isNativeGoogleAuthPlatform(platform);
}

module.exports = {
  googleAuthSchemes,
  googleNativeRedirectUri,
  googleReversedClientScheme,
  isNativeGoogleAuthPlatform,
  shouldForceImplicitIdToken,
};
