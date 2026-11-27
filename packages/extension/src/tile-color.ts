/**
 * The tile of a publisher: one colour from a fixed set, chosen by the domain,
 * so the same domain keeps the same tile on the block page and in the source
 * card. The letter is white on that colour.
 */
export const TILE_COLORS = [
  '#1F2937',
  '#2F4A6D',
  '#3B2F63',
  '#1D4ED8',
  '#5C3B2E',
  '#44403C',
  '#4A2F3D',
  '#1B3A5C',
  '#2E4A2A',
] as const;

export function tileColor(domain: string): string {
  let hash = 0;

  for (const character of domain) {
    hash += character.charCodeAt(0);
  }

  return TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0];
}

/** The one letter a tile carries, or an empty string when the value has none. */
export function tileLetter(value: string): string {
  return /[a-z0-9]/i.exec(value)?.[0]?.toUpperCase() ?? '';
}
