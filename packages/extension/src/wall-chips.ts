import type { Wall } from '@detour/shared';

import { WALL_CATEGORY_LABEL, WALL_TYPE_LABEL } from './copy';
import { roleElement } from './dom';

/**
 * One pill per wall: the category in ink, a middot, and the type in grey. The
 * block page and the popup draw the same element, so the words and the
 * arrangement cannot drift apart between the two surfaces.
 */
export function wallChip(wall: Wall): HTMLSpanElement {
  const chip = document.createElement('span');

  chip.dataset.role = 'wall';
  chip.dataset.category = wall.category;
  chip.dataset.type = wall.type;

  const category = document.createElement('span');

  category.dataset.role = 'wall-category';
  category.textContent = WALL_CATEGORY_LABEL[wall.category];

  const separator = document.createElement('span');

  separator.dataset.role = 'wall-sep';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '·';

  const type = document.createElement('span');

  type.dataset.role = 'wall-type';
  type.textContent = WALL_TYPE_LABEL[wall.type];

  chip.append(category, separator, type);

  return chip;
}

/** Fills one container with the pills of a site, and hides it when there are none. */
export function renderWalls(role: string, walls: readonly Wall[]): void {
  const element = roleElement(role);

  if (element === null) {
    return;
  }

  element.replaceChildren(...walls.map(wallChip));
  element.hidden = walls.length === 0;
}
