'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('writeIcons', () => {
  it('writes launcher, adaptive, splash, and Play Store PNGs', async () => {
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths();
    await writeIcons({
      logoBuffer: TINY_PNG,
      primaryColor: '#d936bb',
      initials: 'SP',
    });
    for (const file of Object.values(paths)) {
      assert.equal(fs.existsSync(file), true, `missing ${file}`);
      assert.ok(fs.statSync(file).size > 100);
    }

    const sharp = require('sharp');
    const { data } = await sharp(paths.icon).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    const stampedBrandColor = data[0] > 180 && data[1] < 80 && data[2] > 150;
    assert.equal(stampedBrandColor, false, 'uploaded logo must not be flattened onto the brand color');
  });

  it('flattens transparent pixels for the iOS icon only', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths, pngHasTransparency } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths();
    const transparentLogo = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 12, height: 12, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
          })
            .png()
            .toBuffer(),
          gravity: 'center',
        },
      ])
      .png()
      .toBuffer();

    await writeIcons({
      logoBuffer: transparentLogo,
      primaryColor: '#d936bb',
      initials: 'SP',
      iosFlattenColor: '#ffffff',
    });

    const iosMeta = await sharp(paths.icon).metadata();
    const adaptiveMeta = await sharp(paths.adaptiveIcon).metadata();
    assert.equal(iosMeta.hasAlpha, false);
    assert.equal(adaptiveMeta.hasAlpha, true);
    assert.equal(await pngHasTransparency(sharp, fs.readFileSync(paths.adaptiveIcon)), true);

    const { data } = await sharp(paths.icon).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(data[0], 255);
    assert.equal(data[1], 255);
    assert.equal(data[2], 255);
  });
});
