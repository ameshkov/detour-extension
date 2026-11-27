import {
  ALTERNATIVES_HEADING,
  BACK_LABEL,
  ESC_KEY,
  ALTERNATIVES_LOADING,
  ANTI_USER_NOTE,
  FOOTNOTE,
  NO_RECORD_LINK,
  NO_RECORD_NOTICE,
  NO_RECORD_TAIL,
  NO_URL_HEADLINE,
  NO_URL_NOTICE,
  SCOPE_LABEL,
  WALLS_HINT,
  WALLS_LABEL,
  headline,
  pageTitle,
  wallsDetected,
} from './copy';
import { renderCopyAddress } from './copy-address';
import { roleElement, setHidden, setText } from './dom';
import type { ListedSiteView } from './state-view';
import type { PageMeta } from './metadata';
import { compactUrl, hostOf, isWebUrl } from './page-url';
import { isThemeChoice } from './theme';
import type { ThemeChoice } from './theme';
import { tileColor, tileLetter } from './tile-color';
import { bindWallDetails, renderWalls } from './wall-chips';

/** The theme the worker stamped into the URL, or the system choice. */
export function themeFrom(search: string): ThemeChoice {
  const value = new URLSearchParams(search).get('theme');

  return isThemeChoice(value) ? value : 'system';
}

/**
 * The source tile carries the icon of the publisher when the reader allows
 * icons and the page names one; otherwise it carries the first letter of the
 * publisher on the colour that the domain earns, as a result row does. An icon
 * that fails to load leaves the letter in its place.
 */
/** The tile is 36 px, so a smaller icon either blurs or, as CNET and ZDNET serve
 *  at `/favicon.ico`, draws nothing at all. The letter says more than that. */
const SOURCE_ICON_MIN = 32;

/**
 * The tile starts as the letter of the domain, so the card never shows an empty
 * square while the publisher's icon downloads, and the icon replaces the letter
 * when it loads at the size of the tile. An icon that fails to load, or that is
 * smaller than the tile, leaves the letter in its place: CNET and ZDNET serve a
 * 16 px fully transparent file at `/favicon.ico`, and that file draws nothing.
 */
function renderSourceTile(
  original: string | null,
  meta: PageMeta | null,
  imagesEnabled: boolean,
): void {
  const tile = roleElement('source-tile');
  const value = original === null ? '' : (hostOf(original) ?? compactUrl(original));
  const letter = tileLetter(value);
  const icon = original !== null && imagesEnabled ? (meta?.icon ?? null) : null;

  if (tile === null) {
    return;
  }

  tile.replaceChildren();
  delete tile.dataset.icon;
  tile.textContent = letter;
  tile.style.backgroundColor = letter === '' ? '' : tileColor(value);
  tile.hidden = letter === '';

  if (icon === null) {
    return;
  }

  const image = document.createElement('img');

  image.src = icon;
  image.alt = '';
  image.hidden = true;
  image.referrerPolicy = 'no-referrer';
  image.dataset.role = 'source-icon';
  image.addEventListener('error', () => {
    image.remove();
  });
  image.addEventListener('load', () => {
    if (image.naturalWidth < SOURCE_ICON_MIN) {
      image.remove();

      return;
    }

    image.hidden = false;
    tile.replaceChildren(image);
    tile.dataset.icon = 'true';
    tile.style.backgroundColor = '';
  });
  tile.append(image);
}

/**
 * The address is text, not a link: the card shows where the reader went, and the
 * only way out of it is the control in the card foot. It takes the mono face,
 * with the host in ink and the path in grey, and a longer path ends in an
 * ellipsis.
 */
function renderSourceAddress(original: string | null): void {
  const address = roleElement('source-address');
  const section = roleElement('source');

  if (section !== null) {
    section.hidden = original === null;
  }

  renderSourceTile(original, null, false);
  renderCopyAddress(original);
  setText('source-description', '');
  setHidden('source-description', true);

  if (address === null) {
    return;
  }

  address.replaceChildren();

  if (original === null) {
    return;
  }

  if (isWebUrl(original)) {
    const host = hostOf(original) ?? '';
    const path = new URL(original).pathname;
    const domain = document.createElement('span');
    const rest = document.createElement('span');

    domain.dataset.role = 'source-domain';
    domain.textContent = host;
    rest.dataset.role = 'source-path';
    rest.textContent = path === '/' ? '' : path;
    address.append(domain, rest);
  } else {
    address.textContent = compactUrl(original);
  }
}

/**
 * The one line of a page whose tab record is gone. The address is still in the
 * query, so the link offers the article again: that navigation runs the guard,
 * the worker records a fresh capability, and the routes can load.
 */
export function renderNotice(original: string | null): void {
  const body = roleElement('notice-body');

  if (body === null) {
    return;
  }

  body.replaceChildren();

  if (original === null) {
    body.textContent = NO_URL_NOTICE;
  } else {
    const link = document.createElement('a');

    link.href = original;
    link.textContent = NO_RECORD_LINK;
    body.append(
      document.createTextNode(`${NO_RECORD_NOTICE} `),
      link,
      document.createTextNode(` ${NO_RECORD_TAIL}`),
    );
  }

  setHidden('notice', false);
}

/**
 * Everything the page can say without asking anyone: the headline, the two
 * headings, the footnote, and the source link. It runs before the first storage
 * read and the first request, so the page is usable while the list area waits.
 * The walls and the judgement wait for the list, because both depend on the
 * entry that matched.
 */
export function renderExplanation(original: string | null): void {
  setText('headline', NO_URL_HEADLINE);
  setText('lede', '');
  setHidden('lede', true);
  setHidden('wall-status', true);
  setText('walls-label', WALLS_LABEL);
  setText('walls-hint', WALLS_HINT);
  renderWalls('walls', []);
  setHidden('walls-row', true);
  setHidden('walls-detail', true);
  setText('alternatives-heading', ALTERNATIVES_HEADING);
  setText('status', original === null ? '' : ALTERNATIVES_LOADING);
  setText('footnote', FOOTNOTE);
  setText('back-label', BACK_LABEL);
  setText('back-key', ESC_KEY);
  setText('open-menu-label', SCOPE_LABEL.tab);
  setHidden('actions', original === null);
  // The open control names a site and a scope that only the answer carries, so
  // the frame does not paint a button that cannot say what it does.
  setHidden('open-site', true);
  setHidden('note', original === null);
  setHidden('notice', true);
  // The theme control writes the whole settings record, and this frame has no
  // state yet. It appears with the answer.
  setHidden('theme', true);
  renderSourceAddress(original);
}

/**
 * The site, its walls, and the named headline. A paywall, a consent dialog, or
 * an age check is the publisher's business, so the judgement appears only when
 * the entry carries an ad-blocker wall.
 */
export function renderListEntry(site: ListedSiteView | null, original: string | null): void {
  const entry = original === null ? null : site;
  const walls = entry?.walls ?? [];
  const judged = walls.some((wall) => wall.category === 'adblock');

  setText('headline', headline(entry?.name ?? null, walls.length));
  setText('wall-status-text', wallsDetected(walls.length));
  setHidden('wall-status', walls.length === 0);
  document.title = pageTitle(entry?.name ?? null);
  renderWalls('walls', walls, { interactive: true });
  bindWallDetails(walls, { verified: entry?.verified, note: entry?.note ?? '' });
  setHidden('walls-row', walls.length === 0);
  setText('lede', judged ? ANTI_USER_NOTE : '');
  setHidden('lede', !judged);
}

/**
 * The metadata answer adds the title, the description, and the icon of the
 * stopped page; the URL stays as it is. The icon replaces the letter only when
 * the reader allows publisher icons, and the card keeps the letter otherwise. A
 * title that only repeats the address is dropped: the card shows the address one
 * line above it, and a page the guard stopped before it wrote its title answers
 * with the bare host.
 */
export function renderSourceCard(
  meta: PageMeta | null,
  original: string | null,
  imagesEnabled: boolean,
): void {
  const description = meta?.description ?? null;
  const title = sourceTitle(meta?.title ?? null, original === null ? '' : (hostOf(original) ?? ''));

  setText('source-title', title);
  setHidden('source-title', title === '');
  setText('source-description', description ?? '');
  setHidden('source-description', description === null);
  renderSourceTile(original, meta, imagesEnabled);
}

/** The title of the story, or nothing when it says no more than the address. */
function sourceTitle(title: string | null, host: string): string {
  const value = (title ?? '').trim();

  if (value === '' || host === '') {
    return value;
  }

  const lower = value.toLowerCase();
  const bare = host.toLowerCase().replace(/^www\./, '');

  return lower === host.toLowerCase() || lower === bare ? '' : value;
}
