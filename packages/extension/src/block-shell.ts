import type { SitesJson } from '@detour/shared';

import {
  ALTERNATIVES_HEADING,
  ALTERNATIVES_LOADING,
  FOOTNOTE,
  PRACTICE_EXPLANATION,
  SOURCE_LABEL,
  WALL_PRACTICE,
  headline,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { findSite } from './list-matching';
import type { PageMeta } from './metadata';
import { hostOf, isWebUrl } from './page-url';

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
 * Everything the page can say without asking anyone: the explanation, the two
 * headings, the site chip, the footnote, and the source link. It runs before the
 * first storage read and the first request, so the page is usable while the list
 * area waits.
 */
export function renderExplanation(original: string | null): void {
  const host = hostOf(original);

  setText('headline', headline(null));
  setText('practice', '');
  setText('explanation', PRACTICE_EXPLANATION);
  setText('source-label', SOURCE_LABEL);
  setText('alternatives-heading', ALTERNATIVES_HEADING);
  setText('status', original === null ? '' : ALTERNATIVES_LOADING);
  setText('chip-host', host ?? '');
  setHidden('chip', host === null);
  setText('footnote', FOOTNOTE);
  setHidden('actions', original === null);
  renderSourceLink(original);
}

/** The site, its wall, the named headline, and the chip of the matched entry. */
export function renderListEntry(list: SitesJson | null, original: string | null): void {
  const site = list === null || original === null ? null : findSite(list, original);

  setText('headline', headline(site?.name ?? null));
  setText('practice', site === null ? '' : WALL_PRACTICE[site.wall]);

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
