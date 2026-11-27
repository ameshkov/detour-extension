import type { Wall } from '@detour/shared';

import {
  REPORT_WALL_LABEL,
  WALL_CATEGORY_LABEL,
  WALL_TYPE_BADGE,
  WALL_TYPE_DETAIL,
  WALL_TYPE_LABEL,
  verifiedOn,
} from './copy';
import { roleElement } from './dom';

/** A wall on the block page opens its detail; the popup keeps it a word. */
export type WallChipOptions = {
  interactive?: boolean;
};

/** What the list knows about the site, for the one detail that serves its walls. */
export type WallDetailOptions = {
  verified?: string;
  note?: string;
};

const SVG = 'http://www.w3.org/2000/svg';

type IconSpec = {
  circle?: { cx: number; cy: number; r: number };
  rect?: { x: number; y: number; width: number; height: number; rx: number };
  paths: readonly string[];
};

/** One simple line icon per category, so a pill reads before its word is read. */
const WALL_ICONS: Record<Wall['category'], IconSpec> = {
  adblock: {
    paths: ['M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z', 'm5 5 14 14'],
  },
  paywall: {
    rect: { x: 3, y: 11, width: 18, height: 11, rx: 2 },
    paths: ['M7 11V7a5 5 0 0 1 10 0v4'],
  },
  registration: {
    circle: { cx: 10, cy: 8, r: 5 },
    paths: ['M2 21a8 8 0 0 1 10.434-7.62', 'M18 14v6', 'M15 17h6'],
  },
  consent: {
    circle: { cx: 12, cy: 12, r: 9 },
    paths: ['M9 10h.01', 'M15 10h.01', 'M12 15h.01'],
  },
  region: {
    circle: { cx: 12, cy: 12, r: 9 },
    paths: ['M3 12h18', 'M12 3c2.5 3 2.5 15 0 18', 'M12 3c-2.5 3-2.5 15 0 18'],
  },
  vpn: {
    paths: ['M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  },
  age: {
    rect: { x: 2, y: 5, width: 20, height: 14, rx: 2 },
    paths: ['M7 15h4', 'M15 15h2', 'M7 11h2'],
  },
};

function categoryIcon(category: Wall['category']): SVGSVGElement {
  const spec = WALL_ICONS[category];
  const svg = document.createElementNS(SVG, 'svg');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (spec.circle !== undefined) {
    const circle = document.createElementNS(SVG, 'circle');

    circle.setAttribute('cx', String(spec.circle.cx));
    circle.setAttribute('cy', String(spec.circle.cy));
    circle.setAttribute('r', String(spec.circle.r));
    svg.append(circle);
  }

  if (spec.rect !== undefined) {
    const rect = document.createElementNS(SVG, 'rect');

    rect.setAttribute('x', String(spec.rect.x));
    rect.setAttribute('y', String(spec.rect.y));
    rect.setAttribute('width', String(spec.rect.width));
    rect.setAttribute('height', String(spec.rect.height));
    rect.setAttribute('rx', String(spec.rect.rx));
    svg.append(rect);
  }

  for (const d of spec.paths) {
    const path = document.createElementNS(SVG, 'path');

    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

function flagElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  path.setAttribute(
    'd',
    'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528',
  );
  svg.append(path);

  return svg;
}

function caretElement(): HTMLSpanElement {
  const caret = document.createElement('span');
  const svg = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');

  caret.setAttribute('data-role', 'wall-caret');
  caret.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', 'M3 4.5 6 7.5 9 4.5');
  svg.append(path);
  caret.append(svg);

  return caret;
}

/**
 * One pill per wall: its category, with its icon. The block page makes the pill
 * a button that opens the type and the description; the popup keeps a span and
 * carries the type inline, because it has no room for the description.
 */
export function wallChip(wall: Wall, options: WallChipOptions = {}): HTMLElement {
  const interactive = options.interactive === true;
  const chip = interactive ? document.createElement('button') : document.createElement('span');

  chip.dataset.role = 'wall';
  chip.dataset.category = wall.category;
  chip.dataset.type = wall.type;

  if (chip instanceof HTMLButtonElement) {
    chip.type = 'button';
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute('aria-controls', 'walls-detail');
  }

  const icon = document.createElement('span');

  icon.dataset.role = 'wall-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(categoryIcon(wall.category));

  const category = document.createElement('span');

  category.dataset.role = 'wall-category';
  category.textContent = WALL_CATEGORY_LABEL[wall.category];

  chip.append(icon, category);

  if (interactive) {
    chip.append(caretElement());

    return chip;
  }

  const separator = document.createElement('span');

  separator.dataset.role = 'wall-sep';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '·';

  const type = document.createElement('span');

  type.dataset.role = 'wall-type';
  type.textContent = WALL_TYPE_LABEL[wall.type];

  chip.append(separator, type);

  return chip;
}

/** Fills one container with the pills of a site, and hides it when there are none. */
export function renderWalls(
  role: string,
  walls: readonly Wall[],
  options: WallChipOptions = {},
): void {
  const element = roleElement(role);

  if (element === null) {
    return;
  }

  element.replaceChildren(...walls.map((wall) => wallChip(wall, options)));
  element.hidden = walls.length === 0;
}

/**
 * One detail region serves every pill. A press opens the pill it names and
 * closes the other one, and a second press closes it again. The region holds the
 * category and its icon, the type as a badge, the checked date, the site's own
 * note, and the link that reports a wrong detection.
 */
export function bindWallDetails(walls: readonly Wall[], options: WallDetailOptions = {}): void {
  const container = roleElement('walls');
  const detail = roleElement('walls-detail');
  const buttons = [
    ...(container?.querySelectorAll<HTMLButtonElement>('button[data-role="wall"]') ?? []),
  ];

  const closeAll = (): void => {
    for (const button of buttons) {
      button.setAttribute('aria-expanded', 'false');
    }

    if (detail !== null) {
      detail.hidden = true;
    }
  };

  closeAll();

  for (const [index, button] of buttons.entries()) {
    const wall = walls[index];

    if (wall === undefined) {
      continue;
    }

    button.onclick = (): void => {
      const open = button.getAttribute('aria-expanded') === 'true';

      closeAll();

      if (open) {
        return;
      }

      button.setAttribute('aria-expanded', 'true');

      if (detail !== null) {
        const head = document.createElement('div');
        const icon = document.createElement('span');
        const body = document.createElement('div');
        const title = document.createElement('div');
        const name = document.createElement('strong');
        const badge = document.createElement('span');
        const text = document.createElement('p');

        head.setAttribute('data-role', 'wall-detail-head');
        icon.setAttribute('data-role', 'wall-detail-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.append(categoryIcon(wall.category));
        body.setAttribute('data-role', 'wall-detail-body');
        title.setAttribute('data-role', 'wall-detail-title');
        name.textContent = WALL_CATEGORY_LABEL[wall.category];
        badge.setAttribute('data-role', 'wall-type-badge');
        badge.setAttribute('data-type', wall.type);
        badge.textContent = WALL_TYPE_BADGE[wall.type];
        badge.title = WALL_TYPE_DETAIL[wall.type];
        title.append(name, badge);

        if (options.verified !== undefined && options.verified !== '') {
          const stamp = document.createElement('span');

          stamp.setAttribute('data-role', 'wall-verified');
          stamp.textContent = verifiedOn(options.verified);
          title.append(stamp);
        }

        text.setAttribute('data-role', 'wall-detail-text');
        text.textContent =
          options.note !== undefined && options.note !== ''
            ? options.note
            : WALL_TYPE_DETAIL[wall.type];
        body.append(title, text);
        head.append(icon, body);
        detail.replaceChildren(head);

        const report = roleElement('report');

        if (report instanceof HTMLAnchorElement && report.getAttribute('href') !== null) {
          const foot = document.createElement('div');
          const link = document.createElement('a');

          foot.setAttribute('data-role', 'wall-detail-foot');
          link.setAttribute('data-role', 'wall-report');
          link.setAttribute('href', report.href);
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noreferrer noopener');
          link.textContent = REPORT_WALL_LABEL;
          link.prepend(flagElement());
          foot.append(link);
          detail.append(foot);
        }

        detail.hidden = false;
      }
    };
  }
}
