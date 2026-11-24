import type { Wall, WallCategory, WallType } from '@detour/shared';

/** Every wall type, in the order that the settings page shows them. */
export const WALL_TYPES = ['hard', 'soft', 'metered'] as const satisfies readonly WallType[];

/** Every wall category, in the order that the settings page shows them. */
export const WALL_CATEGORIES = [
  'adblock',
  'paywall',
  'registration',
  'consent',
  'region',
  'vpn',
  'age',
] as const satisfies readonly WallCategory[];

/** A metered wall is a subscription that limits a count, so it covers one category. */
export const METERED_CATEGORY: WallCategory = 'paywall';

/**
 * The walls that stop a page, grouped by the type that presents them. One reader
 * can stop an ad-blocker wall that covers the article and leave a paywall that
 * replaces it alone, so the reader picks a type first and then its categories.
 */
export type WallSettings = Record<WallType, WallCategory[]>;

/**
 * Detour stops ad-blocker walls and leaves every other category running. The
 * The bundled list and the local fixture carry ad-blocker walls, so this
 * default stops them, and a paywall, a consent dialog, or an age check never
 * stops a page unless the reader asks for it.
 */
export function defaultWalls(): WallSettings {
  return { hard: ['adblock'], soft: ['adblock'], metered: [] };
}

/** A metered cell outside the paywall row cannot be chosen, because a count needs a subscription. */
export function isWallCellPossible(type: WallType, category: WallCategory): boolean {
  return type !== 'metered' || category === METERED_CATEGORY;
}

/** Keeps a typed list in the order of the settings page, so a write is stable. */
function inOrder(categories: readonly WallCategory[]): WallCategory[] {
  return WALL_CATEGORIES.filter((category) => categories.includes(category));
}

/** The page stops when one of its walls is one that the reader chose. */
export function wallStops(walls: WallSettings, wall: Wall): boolean {
  return walls[wall.type].includes(wall.category);
}

/** A site with no chosen wall fails open, so the page loads. */
export function anyWallStops(walls: WallSettings, siteWalls: readonly Wall[]): boolean {
  return siteWalls.some((wall) => wallStops(walls, wall));
}

/** One cell of the settings table, without changing the object it came from. */
export function setWallCell(
  walls: WallSettings,
  type: WallType,
  category: WallCategory,
  chosen: boolean,
): WallSettings {
  if (!isWallCellPossible(type, category)) {
    return walls;
  }

  const current = walls[type];
  const next = chosen
    ? [...current, ...(current.includes(category) ? [] : [category])]
    : current.filter((entry) => entry !== category);

  return { ...walls, [type]: inOrder(next) };
}

export function isWallCategory(value: unknown): value is WallCategory {
  return WALL_CATEGORIES.includes(value as WallCategory);
}

/**
 * The stored walls, or the defaults. A type falls back on its own, so a settings
 * record of another shape costs one type and never the whole choice, and a pair
 * that the list can not hold is dropped.
 */
export function readWallSettings(value: unknown): WallSettings {
  const defaults = defaultWalls();

  if (typeof value !== 'object' || value === null) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const result = defaultWalls();

  for (const type of WALL_TYPES) {
    const stored = record[type];

    if (!Array.isArray(stored)) {
      result[type] = defaults[type];

      continue;
    }

    const categories = stored.filter(isWallCategory).filter((category) => {
      return isWallCellPossible(type, category);
    });

    result[type] = inOrder(categories);
  }

  return result;
}

/** A settings record that arrives through a message carries the same shape as a stored one. */
export function isWallSettings(value: unknown): value is WallSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return WALL_TYPES.every((type) => {
    const stored = record[type];

    return (
      Array.isArray(stored) &&
      stored.every((category) => {
        return isWallCategory(category) && isWallCellPossible(type, category);
      })
    );
  });
}
