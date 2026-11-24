import type { SitesJson } from '@detour/shared';

import {
  ALTERNATIVES_HEADING,
  ALTERNATIVES_LOADING,
  ANTI_USER_NOTE,
  FOOTNOTE,
  NO_URL_HEADLINE,
  SOURCE_LABEL,
  headline,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { findSite } from './list-matching';
import type { PageMeta } from './metadata';
import { hostOf, isWebUrl } from './page-url';
import { renderWalls } from './wall-chips';

/** The original URL, or null when the page was opened without one. */
export function originalUrl(search: string): string | null {
  const value = new URLSearchParams(search).get('u');

  return value === null || value === '' ? null : value;
}

/**
 * The link is the URL from the query, and it never changes: the card gains a
 * title and a description beside it when the metadata arrives.
 */
function renderSourceLink(original: string | null): void {
  const link = roleElement('source-link');
  const section = roleElement('source');

  if (section !== null) {
    section.hidden = original === null;
  }

  if (link === null) {
    return;
  }

  if (original === null) {
    link.removeAttribute('href');
    link.textContent = '';
  } else {
    link.textContent = original;

    if (isWebUrl(original)) {
      link.setAttribute('href', original);
    } else {
      link.removeAttribute('href');
    }
  }
}

/**
 * Everything the page can say without asking anyone: the headline, the two
 * headings, the site chip, the footnote, and the source link. It runs before the
 * first storage read and the first request, so the page is usable while the list
 * area waits. The walls and the judgement wait for the list, because both depend
 * on the entry that matched.
 */
export function renderExplanation(original: string | null): void {
  const host = hostOf(original);

  setText('headline', NO_URL_HEADLINE);
  setText('lede', '');
  setHidden('lede', true);
  renderWalls('walls', []);
  setText('source-label', SOURCE_LABEL);
  setText('alternatives-heading', ALTERNATIVES_HEADING);
  setText('status', original === null ? '' : ALTERNATIVES_LOADING);
  setText('chip-host', host ?? '');
  setHidden('chip', host === null);
  setText('footnote', FOOTNOTE);
  setHidden('actions', original === null);
  renderSourceLink(original);
}

/**
 * The site, its walls, the named headline, and the chip of the matched entry. A
 * paywall, a consent dialog, or an age check is the publisher's business, so the
 * judgement appears only when the entry carries an ad-blocker wall.
 */
export function renderListEntry(list: SitesJson | null, original: string | null): void {
  const site = list === null || original === null ? null : findSite(list, original);
  const walls = site?.walls ?? [];
  const judged = walls.some((wall) => wall.category === 'adblock');

  setText('headline', headline(site?.name ?? null, walls.length));
  renderWalls('walls', walls);
  setText('lede', judged ? ANTI_USER_NOTE : '');
  setHidden('lede', !judged);

  if (site !== null) {
    setText('chip-host', site.domain);
    setHidden('chip', false);
  }
}

/** The metadata answer adds a title and a description; the URL stays as it is. */
export function renderSourceCard(meta: PageMeta | null): void {
  setText('source-title', meta?.title ?? '');
  setText('source-description', meta?.description ?? '');
}
