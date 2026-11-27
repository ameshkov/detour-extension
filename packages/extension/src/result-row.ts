import { NO_WALLS_LABEL, matchLabel } from './copy';
import type { RouteView } from './state-view';
import { tileColor, tileLetter } from './tile-color';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The mark of a route without walls: the circle with its tick, drawn at 12 px in
 * the clear ink. It is decoration, so the word beside it carries the meaning.
 */
function checkElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const circle = document.createElementNS(SVG_NS, 'circle');
  const tick = document.createElementNS(SVG_NS, 'path');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  tick.setAttribute('d', 'm16 9-5.5 5.5L8 12');
  svg.append(circle, tick);

  return svg;
}

/** The one claim a row makes about a site: the list carries no wall for it. */
function clearElement(): HTMLSpanElement {
  const badge = document.createElement('span');

  badge.setAttribute('data-role', 'result-walls');
  badge.setAttribute('data-walls', 'none');
  badge.append(checkElement(), document.createTextNode(NO_WALLS_LABEL));

  return badge;
}

function arrowElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const top = document.createElementNS(SVG_NS, 'path');
  const stem = document.createElementNS(SVG_NS, 'path');

  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  top.setAttribute('d', 'M7 7h10v10');
  stem.setAttribute('d', 'M7 17 17 7');
  svg.append(top, stem);

  return svg;
}

/**
 * The tile starts as the letter of the domain and the favicon replaces it when
 * it loads, so a row never shows an empty square while the backend signs the
 * image. A favicon that fails to load leaves the letter in its place.
 */
function tileElement(route: RouteView, imagesEnabled: boolean): HTMLSpanElement {
  const tile = document.createElement('span');
  const favicon = imagesEnabled ? route.favicon : null;

  tile.setAttribute('data-role', 'tile');
  tile.setAttribute('aria-hidden', 'true');
  tile.dataset.tile = 'letter';
  tile.style.backgroundColor = tileColor(route.domain);
  tile.textContent = tileLetter(route.domain);

  if (favicon === null) {
    return tile;
  }

  const image = document.createElement('img');

  image.alt = '';
  image.hidden = true;
  image.setAttribute('referrerpolicy', 'no-referrer');
  // The icon loads while the tile still holds the letter, and a lazy image that
  // is hidden and below the fold never loads at all.
  image.addEventListener('load', () => {
    image.hidden = false;
    tile.replaceChildren(image);
    tile.dataset.tile = 'favicon';
    tile.style.backgroundColor = '';
  });
  image.addEventListener('error', () => {
    image.remove();
  });
  image.src = favicon;
  tile.append(image);

  return tile;
}

/**
 * One row: the tile of the answer's favicon, or its letter, then the title, the
 * description, the domain, and the number with its arrow. Every row uses the
 * same shape on both surfaces.
 *
 * The whole row is one link, so the reader aims at the row and not at a line of
 * text inside it. The title, the description, the domain, and the tile all
 * belong to that link.
 */
export function routeRow(route: RouteView, imagesEnabled: boolean, index: number): HTMLLIElement {
  const row = document.createElement('li');
  const link = document.createElement('a');

  link.setAttribute('href', route.url);
  link.setAttribute('rel', 'noreferrer');

  link.append(tileElement(route, imagesEnabled));

  const title = document.createElement('span');
  const meta = document.createElement('p');
  const domain = document.createElement('span');

  title.setAttribute('data-role', 'result-title');
  title.textContent = route.title;

  meta.setAttribute('data-role', 'result-meta');
  domain.setAttribute('data-role', 'result-domain');
  domain.textContent = route.domain;
  meta.append(domain);

  // A route earns the badge only when the list in use carries no wall for that
  // exact address. A site that the list carries makes no claim, and so does a
  // list that the worker could not read.
  if (route.walls === 'none') {
    meta.append(clearElement());
  }

  // The analysis names how close the row is. A row it could not place makes no
  // claim, the same way a row without an answer does.
  if (route.match !== null) {
    const closeness = matchLabel(route.match);

    if (closeness !== null) {
      const match = document.createElement('span');

      match.setAttribute('data-role', 'result-match');
      match.setAttribute('data-match', route.match);
      match.textContent = closeness;
      meta.append(match);
    }
  }

  link.append(title);

  if (route.description !== '') {
    const description = document.createElement('p');

    description.setAttribute('data-role', 'result-description');
    description.textContent = route.description;
    link.append(description);
  }

  link.append(meta);

  // The number is the keyboard shortcut of the row, and the arrow says that the
  // row leaves the page. Both are dead on a phone, so the sheet drops them.
  const action = document.createElement('span');
  const key = document.createElement('kbd');
  const arrow = document.createElement('span');

  action.setAttribute('data-role', 'result-action');
  key.setAttribute('data-role', 'result-key');
  key.textContent = String(index + 1);
  arrow.setAttribute('data-role', 'result-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.append(arrowElement());
  action.append(key, arrow);
  link.append(action);

  row.append(link);

  return row;
}
