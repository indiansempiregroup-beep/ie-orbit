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

function googleNativeRedirectUri({ androidClientId, appSlug, applicationId } = {}) {
  const reversed = googleReversedClientScheme(androidClientId);
  if (reversed) return `${reversed}:/oauthredirect`;
  const slug = String(appSlug || '').trim();
  if (slug) return `${slug}:/oauthredirect`;
  const appId = String(applicationId || '').trim();
  return appId ? `${appId}:/oauthredirect` : '';
}

function googleSignInConfigured({ platform, androidClientId, webClientId } = {}) {
  const web = String(webClientId || '').trim();
  const android = String(androidClientId || '').trim();
  if (platform === 'web') return Boolean(web);
  // Android needs the Web client for id tokens and the Android client in Google Cloud.
  if (platform === 'android') return Boolean(web && android);
  if (platform === 'ios') return Boolean(web);
  return Boolean(web || android);
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
  return platform === 'web';
}

module.exports = {
  googleAuthSchemes,
  googleNativeRedirectUri,
  googleReversedClientScheme,
  googleSignInConfigured,
  isNativeGoogleAuthPlatform,
  shouldForceImplicitIdToken,
};
