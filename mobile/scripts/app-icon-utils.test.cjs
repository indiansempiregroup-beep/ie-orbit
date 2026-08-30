'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
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
} = require('./app-icon-utils.cjs');

describe('initialsFromAppName', () => {
  it('uses the first letter of the first two words', () => {
    assert.equal(initialsFromAppName('Sanket Pet Shop'), 'SP');
    assert.equal(initialsFromAppName('Demo Salon'), 'DS');
  });

  it('falls back to the first two letters of a single word', () => {
    assert.equal(initialsFromAppName('Orbit'), 'OR');
  });

  it('uses IE when the name is empty', () => {
    assert.equal(initialsFromAppName(''), 'IE');
  });
});

describe('normalizeHexColor', () => {
  it('accepts 6-digit colors', () => {
    assert.equal(normalizeHexColor('#d936bb'), '#d936bb');
  });

  it('expands 3-digit colors', () => {
    assert.equal(normalizeHexColor('#abc'), '#aabbcc');
  });

  it('falls back for invalid values', () => {
    assert.equal(normalizeHexColor('blue', '#111827'), '#111827');
  });
});

describe('ios flatten color', () => {
  it('defaults transparent iOS icons to the brand color', () => {
    assert.equal(iosIconFlattenColor(''), '#1A56DB');
    assert.equal(iosIconFlattenColor('', '#d936bb'), '#d936bb');
    assert.deepEqual(hexToRgb('#d936bb'), { r: 217, g: 54, b: 187 });
  });

  it('accepts an explicit flatten color', () => {
    assert.equal(iosIconFlattenColor('#d936bb'), '#d936bb');
    assert.deepEqual(hexToRgb('#d936bb'), { r: 217, g: 54, b: 187 });
  });
});

describe('resolveMediaUrl', () => {
  const api = 'https://api.ie-orbit.com/api/v1';

  it('keeps absolute URLs', () => {
    assert.equal(resolveMediaUrl('https://cdn.example/logo.png', api), 'https://cdn.example/logo.png');
  });

  it('prefixes stored media paths with the API origin', () => {
    assert.equal(
      resolveMediaUrl('/api/v1/media/abc/file', api),
      'https://api.ie-orbit.com/api/v1/media/abc/file',
    );
  });

  it('returns empty for a missing url', () => {
    assert.equal(resolveMediaUrl('', api), '');
  });
});

describe('logoFromBootstrap', () => {
  it('prefers branding.logo inside the API envelope', () => {
    assert.equal(
      logoFromBootstrap({
        data: { branding: { logo: '/api/v1/media/1/file' }, business: { logo: '/old' } },
      }),
      '/api/v1/media/1/file',
    );
  });

  it('falls back to business.logo', () => {
    assert.equal(logoFromBootstrap({ data: { branding: {}, business: { logo: '/biz' } } }), '/biz');
  });
});

describe('primaryColorFromBootstrap', () => {
  it('reads branding.primary_color', () => {
    assert.equal(
      primaryColorFromBootstrap({ data: { branding: { primary_color: '#d936bb' } } }, '#111111'),
      '#d936bb',
    );
  });
});

describe('pickIconSource', () => {
  const assetsDir = '/tmp/assets';

  it('prefers a committed flavor override', () => {
    const source = pickIconSource({
      flavorKey: 'sanket-pet-shop-sanket-pet-shop',
      assetsDir,
      overrideExists: true,
      envIconUrl: 'https://example.com/ignored.png',
      bootstrapLogoUrl: '/api/v1/media/1/file',
      apiBaseUrl: 'https://api.ie-orbit.com/api/v1',
    });
    assert.deepEqual(source, {
      kind: 'override',
      value: flavorIconOverridePath(assetsDir, 'sanket-pet-shop-sanket-pet-shop'),
    });
  });

  it('uses the uploaded bootstrap logo next', () => {
    const source = pickIconSource({
      flavorKey: 'sanket-pet-shop-sanket-pet-shop',
      assetsDir,
      overrideExists: false,
      envIconUrl: '',
      bootstrapLogoUrl: '/api/v1/media/1/file',
      apiBaseUrl: 'https://api.ie-orbit.com/api/v1',
    });
    assert.equal(source.kind, 'url');
    assert.equal(source.value, 'https://api.ie-orbit.com/api/v1/media/1/file');
  });

  it('falls back to initials when no logo exists', () => {
    const source = pickIconSource({
      flavorKey: 'demo-MAIN',
      assetsDir,
      overrideExists: false,
      envIconUrl: '',
      bootstrapLogoUrl: '',
      apiBaseUrl: 'https://api.ie-orbit.com/api/v1',
    });
    assert.deepEqual(source, { kind: 'initials', value: '' });
  });
});

describe('bootstrap helpers', () => {
  it('builds the public bootstrap URL', () => {
    assert.equal(
      bootstrapUrl('https://api.ie-orbit.com/api/v1', 'sanket-pet-shop-sanket-pet-shop'),
      'https://api.ie-orbit.com/api/v1/mobile/bootstrap?flavor_key=sanket-pet-shop-sanket-pet-shop',
    );
  });

  it('detects localhost APIs that EAS cannot reach', () => {
    assert.equal(isLocalApiBase('http://localhost:8000/api/v1'), true);
    assert.equal(isLocalApiBase('https://api.ie-orbit.com/api/v1'), false);
  });

  it('reuses a matching fresh cache', () => {
    const now = 1_000_000;
    assert.equal(
      shouldReuseCache(
        { flavorKey: 'a', sourceValue: 'https://logo', fetchedAt: now - 1000 },
        { flavorKey: 'a', sourceValue: 'https://logo', alwaysRefresh: false, now },
      ),
      true,
    );
    assert.equal(
      shouldReuseCache(
        { flavorKey: 'a', sourceValue: 'https://logo', fetchedAt: now - 1000 },
        { flavorKey: 'a', sourceValue: 'https://logo', alwaysRefresh: true, now },
      ),
      false,
    );
  });
});

describe('flavor override path', () => {
  it('keeps the flavor key as a folder name', () => {
    assert.equal(
      flavorIconOverridePath(path.join('/app', 'assets'), 'demo-MAIN'),
      path.join('/app', 'assets', 'flavors', 'demo-MAIN', 'icon.png'),
    );
  });
});
