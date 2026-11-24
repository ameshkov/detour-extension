import { describe, expect, it } from 'vitest';

import type { WallSettings } from './walls';
import {
  anyWallStops,
  defaultWalls,
  isWallCellPossible,
  isWallSettings,
  readWallSettings,
  setWallCell,
  wallStops,
} from './walls';

describe('the walls that stop a page', () => {
  it('stops the ad-blocker walls of every type and nothing else', () => {
    const walls = defaultWalls();

    expect(wallStops(walls, { category: 'adblock', type: 'hard' })).toBe(true);
    expect(wallStops(walls, { category: 'adblock', type: 'soft' })).toBe(true);
    expect(wallStops(walls, { category: 'adblock', type: 'metered' })).toBe(false);
    expect(wallStops(walls, { category: 'paywall', type: 'hard' })).toBe(false);
  });

  it('stops a page when one of its walls is chosen', () => {
    const walls = defaultWalls();

    expect(
      anyWallStops(walls, [
        { category: 'paywall', type: 'hard' },
        { category: 'adblock', type: 'soft' },
      ]),
    ).toBe(true);
    expect(anyWallStops(walls, [{ category: 'paywall', type: 'hard' }])).toBe(false);
    expect(anyWallStops(walls, [])).toBe(false);
  });

  it('ticks one cell without changing the object it came from', () => {
    const walls = defaultWalls();
    const next = setWallCell(walls, 'hard', 'paywall', true);

    expect(walls.hard).toEqual(['adblock']);
    expect(next.hard).toEqual(['adblock', 'paywall']);
  });

  it('clears one cell and keeps the order of the settings page', () => {
    const walls: WallSettings = { hard: ['paywall', 'adblock'], soft: [], metered: [] };
    const next = setWallCell(walls, 'hard', 'paywall', false);

    expect(next.hard).toEqual(['adblock']);
    expect(setWallCell(next, 'hard', 'region', true).hard).toEqual(['adblock', 'region']);
  });

  it('never ticks a metered cell outside the paywall row', () => {
    expect(isWallCellPossible('metered', 'region')).toBe(false);
    expect(isWallCellPossible('metered', 'paywall')).toBe(true);
    expect(setWallCell(defaultWalls(), 'metered', 'region', true).metered).toEqual([]);
  });

  it('reads the defaults when nothing is stored', () => {
    expect(readWallSettings(undefined)).toEqual(defaultWalls());
    expect(readWallSettings(null)).toEqual(defaultWalls());
    expect(readWallSettings('adblock')).toEqual(defaultWalls());
  });

  it('falls back one type at a time', () => {
    const walls = readWallSettings({ hard: ['paywall'], soft: 'adblock' });

    expect(walls).toEqual({ hard: ['paywall'], soft: ['adblock'], metered: [] });
  });

  it('drops a category the list does not hold', () => {
    expect(readWallSettings({ hard: ['ads', 'vpn'] }).hard).toEqual(['vpn']);
  });

  it('keeps a welcome empty choice instead of the default', () => {
    expect(readWallSettings({ hard: [], soft: [] })).toEqual({
      hard: [],
      soft: [],
      metered: [],
    });
  });

  it('reads a settings record that a message brings', () => {
    expect(isWallSettings(defaultWalls())).toBe(true);
    expect(isWallSettings({ hard: ['adblock'], soft: [], metered: [] })).toBe(true);
    expect(isWallSettings({ hard: ['adblock'], soft: [] })).toBe(false);
    expect(isWallSettings({ hard: ['ads'], soft: [], metered: [] })).toBe(false);
    expect(isWallSettings({ hard: ['adblock'], soft: [], metered: ['adblock'] })).toBe(false);
    expect(isWallSettings(null)).toBe(false);
  });
});
