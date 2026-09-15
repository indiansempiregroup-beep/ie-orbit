'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('writeIcons', () => {
  let outputDir;

  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ie-orbit-icons-'));
  });

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('writes launcher, adaptive, splash, and Play Store PNGs on a padded brand plate', async () => {
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);
    await writeIcons({
      logoBuffer: TINY_PNG,
      primaryColor: '#d936bb',
      initials: 'SP',
      outputDir,
    });
    for (const file of Object.values(paths)) {
      assert.equal(fs.existsSync(file), true, `missing ${file}`);
      assert.ok(fs.statSync(file).size > 100);
    }

    const sharp = require('sharp');
    const { data } = await sharp(paths.icon).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(data[0], 217);
    assert.equal(data[1], 54);
    assert.equal(data[2], 187);
  });

  it('keeps adaptive foreground transparent while iOS icon is opaque', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths, pngHasTransparency } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);
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
      outputDir,
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

    const splashCorner = await sharp(paths.splash).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(splashCorner.data[0], 217);
    assert.equal(splashCorner.data[1], 54);
    assert.equal(splashCorner.data[2], 187);
  });

  it('flattens iOS plate onto the brand color by default', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);
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
      outputDir,
    });

    const { data } = await sharp(paths.icon).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(data[0], 217);
    assert.equal(data[1], 54);
    assert.equal(data[2], 187);
  });

  it('writes an as-is override without a brand-color plate', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);
    const solid = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 200, b: 40 } },
    })
      .png()
      .toBuffer();

    await writeIcons({
      logoBuffer: solid,
      primaryColor: '#d936bb',
      initials: 'SP',
      mode: 'as-is',
      outputDir,
    });

    const { data } = await sharp(paths.icon).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(data[0], 10);
    assert.equal(data[1], 200);
    assert.equal(data[2], 40);
  });

  it('applies custom icon and splash backgrounds with padding', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);
    await writeIcons({
      logoBuffer: TINY_PNG,
      primaryColor: '#d936bb',
      initials: 'SP',
      iosFlattenColor: '#112233',
      splashBackground: '#00aa55',
      padding: 0.3,
      outputDir,
    });

    const iconCorner = await sharp(paths.icon).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(iconCorner.data[0], 17);
    assert.equal(iconCorner.data[1], 34);
    assert.equal(iconCorner.data[2], 51);

    const splashCorner = await sharp(paths.splash).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(splashCorner.data[0], 0);
    assert.equal(splashCorner.data[1], 170);
    assert.equal(splashCorner.data[2], 85);
  });

  it('uses a brand-color splash with no initials when the logo is missing', async () => {
    const sharp = require('sharp');
    const { writeIcons, generatedPaths } = require('./materialize-app-icon.cjs');
    const paths = generatedPaths(outputDir);

    await writeIcons({
      logoBuffer: null,
      primaryColor: '#d936bb',
      initials: 'RS',
      outputDir,
    });

    const splashPixel = await sharp(paths.splash)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(splashPixel.data[0], 217);
    assert.equal(splashPixel.data[1], 54);
    assert.equal(splashPixel.data[2], 187);

    const splashRaw = await sharp(paths.splash).raw().toBuffer({ resolveWithObject: true });
    let splashHasWhite = false;
    for (let i = 0; i < splashRaw.data.length; i += splashRaw.info.channels) {
      if (splashRaw.data[i] > 250 && splashRaw.data[i + 1] > 250 && splashRaw.data[i + 2] > 250) {
        splashHasWhite = true;
        break;
      }
    }
    assert.equal(splashHasWhite, false, 'native splash must not paint initials');

    const iconRaw = await sharp(paths.icon).raw().toBuffer({ resolveWithObject: true });
    let iconHasWhite = false;
    for (let i = 0; i < iconRaw.data.length; i += iconRaw.info.channels) {
      if (iconRaw.data[i] > 250 && iconRaw.data[i + 1] > 250 && iconRaw.data[i + 2] > 250) {
        iconHasWhite = true;
        break;
      }
    }
    assert.equal(iconHasWhite, true, 'launcher icon may still use white initials');
  });
});
