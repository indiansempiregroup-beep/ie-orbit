'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  googleAuthSchemes,
  googleNativeRedirectUri,
  googleReversedClientScheme,
  shouldForceImplicitIdToken,
} = require('./googleAuthRequest.cjs');

const ANDROID_CLIENT_ID =
  '373269001775-3fm125kisnkfcjbvqji1vtvegm2326na.apps.googleusercontent.com';

describe('googleReversedClientScheme', () => {
  it('turns an Android client ID into the Google custom scheme', () => {
    assert.equal(
      googleReversedClientScheme(ANDROID_CLIENT_ID),
      'com.googleusercontent.apps.373269001775-3fm125kisnkfcjbvqji1vtvegm2326na',
    );
  });

  it('returns empty for missing or non-Google client IDs', () => {
    assert.equal(googleReversedClientScheme(''), '');
    assert.equal(googleReversedClientScheme('not-a-google-client'), '');
  });
});

describe('googleNativeRedirectUri', () => {
  it('prefers the reversed Android client scheme over the package name', () => {
    assert.equal(
      googleNativeRedirectUri({
        androidClientId: ANDROID_CLIENT_ID,
        applicationId: 'com.ieorbit.sanketpetshop',
      }),
      'com.googleusercontent.apps.373269001775-3fm125kisnkfcjbvqji1vtvegm2326na:/oauthredirect',
    );
  });

  it('falls back to the Android package when no Android client ID is set', () => {
    assert.equal(
      googleNativeRedirectUri({ applicationId: 'com.ieorbit.sanketpetshop' }),
      'com.ieorbit.sanketpetshop:/oauthredirect',
    );
  });
});

describe('googleAuthSchemes', () => {
  it('registers slug, package, and reversed Google client schemes', () => {
    assert.deepEqual(
      googleAuthSchemes({
        appSlug: 'sanket-pet-shop',
        applicationId: 'com.ieorbit.sanketpetshop',
        androidClientId: ANDROID_CLIENT_ID,
      }),
      [
        'sanket-pet-shop',
        'com.ieorbit.sanketpetshop',
        'com.googleusercontent.apps.373269001775-3fm125kisnkfcjbvqji1vtvegm2326na',
      ],
    );
  });
});

describe('shouldForceImplicitIdToken', () => {
  it('keeps implicit id_token for web only', () => {
    assert.equal(shouldForceImplicitIdToken('web'), true);
    assert.equal(shouldForceImplicitIdToken('android'), false);
    assert.equal(shouldForceImplicitIdToken('ios'), false);
  });
});
