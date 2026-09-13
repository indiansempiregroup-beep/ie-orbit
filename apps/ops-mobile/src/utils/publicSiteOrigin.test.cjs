'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { resolvePublicSiteOrigin } = require('./publicSiteOrigin.cjs');

describe('resolvePublicSiteOrigin', () => {
  it('prefers the configured marketing origin', () => {
    assert.equal(
      resolvePublicSiteOrigin({
        configured: 'https://ie-orbit.com/',
        hostname: 'ops.ie-orbit.com',
        protocol: 'https:',
      }),
      'https://ie-orbit.com',
    );
  });

  it('maps local ops web to the Vite public site', () => {
    assert.equal(
      resolvePublicSiteOrigin({ hostname: 'localhost', protocol: 'http:' }),
      'http://localhost:3000',
    );
    assert.equal(
      resolvePublicSiteOrigin({ hostname: '127.0.0.1', protocol: 'http:' }),
      'http://127.0.0.1:3000',
    );
  });

  it('maps ops hosts to the public website', () => {
    assert.equal(
      resolvePublicSiteOrigin({ hostname: 'ops.ie-orbit.com', protocol: 'https:' }),
      'https://ie-orbit.com',
    );
    assert.equal(
      resolvePublicSiteOrigin({ hostname: 'ops-uat.ie-orbit.com', protocol: 'https:' }),
      'https://uat.ie-orbit.com',
    );
  });
});
