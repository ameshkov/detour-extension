import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  ASSETS,
  MARQUEE,
  POPUP_WIDTH,
  SHOT,
  STORE_ICON,
  TILE,
  marqueePage,
  stagePage,
  storeIconPage,
  tilePage,
} from './capture';

const LOGO = 'data:image/png;base64,AAAA';

function size(path: string): { width: number; height: number } {
  const bytes = readFileSync(join(ASSETS, path));

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The pixels of a PNG, so a test can read a colour and an alpha value. */
function pixels(path: string): {
  width: number;
  height: number;
  at: (x: number, y: number) => number[];
} {
  const bytes = readFileSync(join(ASSETS, path));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  expect({ depth: bytes[24], colour: bytes[25] }, path).toEqual({ depth: 8, colour: 6 });

  const parts: Buffer[] = [];
  let offset = 8;

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);

    if (bytes.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
      parts.push(bytes.subarray(offset + 8, offset + 8 + length));
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const line = y * (stride + 1);
    const filter = raw[line] ?? 0;
    const from = line + 1;

    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? (out[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= 4 ? (out[(y - 1) * stride + i - 4] ?? 0) : 0;
      let value = raw[from + i] ?? 0;

      if (filter === 1) {
        value += left;
      } else if (filter === 2) {
        value += up;
      } else if (filter === 3) {
        value += (left + up) >> 1;
      } else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);

        value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }

      out[y * stride + i] = value & 0xff;
    }
  }

  return {
    width,
    height,
    at: (x, y) => [...out.subarray(y * stride + x * 4, y * stride + x * 4 + 4)],
  };
}

describe('the store images', () => {
  it('draws the tile at the size that the store asks for', () => {
    const html = tilePage(LOGO);

    expect(html).toContain(`width: ${TILE.width}px`);
    expect(html).toContain(`height: ${TILE.height}px`);
    expect(html).toContain('#0B6B57');
    expect(html).toContain('>Detour<');
    expect(html).toContain(LOGO);
  });

  it('draws the marquee at the size that the store asks for', () => {
    const html = marqueePage(LOGO);

    expect(html).toContain(`width: ${MARQUEE.width}px`);
    expect(html).toContain(`height: ${MARQUEE.height}px`);
    expect(html).toContain('>Detour<');
    expect(html).toContain(LOGO);
  });

  it('places the store icon on a 128 px canvas with a 96 px tile', () => {
    const html = storeIconPage(LOGO);

    expect(html).toContain(`width: ${STORE_ICON.size}px`);
    expect(html).toContain(`width: ${STORE_ICON.art}px`);
    expect(html).toContain('background: transparent');
    expect(html).toContain(LOGO);
  });

  it('stages a popup shot on the paper colour at 1280 by 800', () => {
    const html = stagePage(LOGO);

    expect(html).toContain(`width: ${SHOT.width}px`);
    expect(html).toContain(`height: ${SHOT.height}px`);
    expect(html).toContain('#FBFAF8');
    expect(html).toContain(LOGO);
  });

  it('keeps the popup at the width of its frame', () => {
    expect(POPUP_WIDTH).toBe(340);
  });

  it('ships the screenshots at the size that the dashboard accepts', () => {
    expect(size('screenshot-block.png')).toEqual({ width: 1280, height: 800 });
    expect(size('screenshot-options.png')).toEqual({ width: 1280, height: 800 });
    expect(size('screenshot-popup.png')).toEqual({ width: 1280, height: 800 });
  });

  it('ships the small promo tile at 440 by 280', () => {
    expect(size('tile-440x280.png')).toEqual({ width: 440, height: 280 });
  });

  it('ships the store icon with the transparent margin that the dashboard asks for', () => {
    const icon = pixels('icon-128.png');

    expect({ width: icon.width, height: icon.height }).toEqual({ width: 128, height: 128 });
    // The tile starts after 16 px, so a corner and the band before it are clear.
    expect(icon.at(0, 0)[3]).toBe(0);
    expect(icon.at(15, 64)[3]).toBe(0);
    expect(icon.at(17, 64)[3]).toBe(255);
    expect(icon.at(64, 64)[3]).toBe(255);
  });

  it('ships the marquee promo tile at 1400 by 560', () => {
    expect(size('marquee-1400x560.png')).toEqual({ width: 1400, height: 560 });
  });

  it('writes real PNG files', () => {
    for (const file of [
      'icon-128.png',
      'screenshot-block.png',
      'screenshot-options.png',
      'screenshot-popup.png',
      'tile-440x280.png',
      'marquee-1400x560.png',
    ]) {
      const bytes = readFileSync(join(ASSETS, file));

      expect(bytes.subarray(0, 8), file).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    }
  });
});
