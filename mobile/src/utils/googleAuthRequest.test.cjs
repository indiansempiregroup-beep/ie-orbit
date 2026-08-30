'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  googleAuthSchemes,
  googleNativeRedirectUri,
  googleReversedClientScheme,
  googleSignInConfigured,
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
  it('uses the reversed Android client scheme for the native OAuth client', () => {
    assert.equal(
      googleNativeRedirectUri({
        androidClientId: ANDROID_CLIENT_ID,
        appSlug: 'sanket-pet-shop',
        applicationId: 'com.ieorbit.sanketpetshop',
      }),
      'com.googleusercontent.apps.373269001775-3fm125kisnkfcjbvqji1vtvegm2326na:/oauthredirect',
    );
  });

  it('falls back to the Android package when no Android client is set', () => {
    assert.equal(
      googleNativeRedirectUri({ applicationId: 'com.ieorbit.sanketpetshop' }),
      'com.ieorbit.sanketpetshop:/oauthredirect',
    );
  });
});

describe('googleSignInConfigured', () => {
  it('uses the customer Android client on Android, not the ops Web client', () => {
    assert.equal(
      googleSignInConfigured({
        platform: 'android',
        androidClientId: ANDROID_CLIENT_ID,
        webClientId: '373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com',
      }),
      true,
    );
    assert.equal(
      googleSignInConfigured({
        platform: 'android',
        webClientId: '373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com',
      }),
      false,
    );
  });

  it('uses the Web client only in the browser', () => {
    assert.equal(
      googleSignInConfigured({
        platform: 'web',
        webClientId: '373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com',
      }),
      true,
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
  it('is only for browser GIS, not the Android customer client', () => {
    assert.equal(shouldForceImplicitIdToken('web'), true);
    assert.equal(shouldForceImplicitIdToken('android'), false);
    assert.equal(shouldForceImplicitIdToken('ios'), false);
  });
});
