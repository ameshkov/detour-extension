import {
  ALTERNATIVES_HEADING,
  FALLBACK_HEADING,
  NO_SITE_NOTICE,
  SEARCH_CARD_POPUP_DETAIL,
  SITE_NOT_LISTED,
  SITE_REPORT_HINT,
  headline,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { renderAlternatives } from './block-results';
import type { PopupDeps } from './popup';
import { openRoute } from './popup-data';
import { reportUrl } from './report';
import { renderSearchFallback, selectEngine } from './search-fallback';
import type { PopupSite, PopupState, PopupView } from './state-view';
import { tileColor, tileLetter } from './tile-color';
import { currentVersion } from './version';
import { bindWallDetails, renderWalls } from './wall-chips';

/** The card names the page: the domain, and one sentence that says why it is here. */
function renderCard(domain: string, description: string): void {
  setHidden('source', false);

  const tile = roleElement('source-tile');

  if (tile !== null) {
    tile.replaceChildren();
    tile.textContent = tileLetter(domain);
    tile.style.backgroundColor = tileColor(domain);
  }

  setText('source-domain', domain);
  setText('source-description', description);
}

/** The pills of a listed site, and the one detail that serves them all. */
function renderSiteWalls(site: PopupSite): void {
  renderWalls('walls', site.walls, { interactive: true });
  setHidden('walls-row', site.walls.length === 0);
  bindWallDetails(site.walls, { verified: site.verified, note: site.note });
}

/**
 * The wall detail's report link copies the address of the page's own report. It
 * is one hidden anchor, so the detail and the footnote never drift apart.
 */
function setReportHref(view: PopupView): void {
  const anchor = roleElement('report');
  const version = currentVersion();
  const report = 'report' in view ? view.report : null;

  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }

  if (report === null || version === null) {
    anchor.removeAttribute('href');

    return;
  }

  anchor.setAttribute('href', reportUrl({ ...report, extensionVersion: version }));
}

/**
 * The report row closes the unlisted card. It is a row of the search card's
 * family, so no surface in the popup is a bare line of text.
 */
function renderReportRow(report: { url: string; listId: string }, key: number): void {
  const row = roleElement('site-report');
  const version = currentVersion();

  if (!(row instanceof HTMLAnchorElement) || version === null) {
    setHidden('site-report', true);

    return;
  }

  row.setAttribute('href', reportUrl({ ...report, extensionVersion: version }));
  setText('report-title', SITE_REPORT_HINT);
  setText('report-key', String(key));
  setHidden('site-report', false);
}

/** The search card of the unlisted page: a press swaps it for the engines. */
function renderUnlistedSearch(query: string, key: number): void {
  const card = roleElement('search');

  setText('search-title', FALLBACK_HEADING);
  setText('search-detail', SEARCH_CARD_POPUP_DETAIL);
  setText('search-key', String(key));
  setHidden('search', false);

  if (card === null) {
    return;
  }

  card.onclick = (): void => {
    setHidden('search', true);
    renderSearchFallback(query);
    selectEngine(0);
  };
}

/** Every row opens in the tab the popup was opened from, through the worker. */
function wireRouteRows(deps: PopupDeps): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-role="list"] > li > a');

  for (const link of links) {
    link.onclick = (event: MouseEvent): void => {
      event.preventDefault();

      const href = link.getAttribute('href') ?? '';

      void openRoute(deps.send, href).finally(deps.close);
    };
  }
}

/** The list area: the rows of a search, or the engines when it found nothing. */
function renderList(
  view: Extract<PopupView, { kind: 'results' | 'empty' | 'error' }>,
  state: PopupState,
  deps: PopupDeps,
): void {
  const section = roleElement('alternatives');

  if (section !== null) {
    section.dataset.state = view.kind;
  }

  renderAlternatives({
    state: view.kind,
    routes: view.kind === 'results' ? view.routes : [],
    imagesEnabled: state.settings.imagesEnabled,
    query: view.query,
    // The popup has no keyboard line, so it carries no story of its own.
    topic: null,
    searchDetail: SEARCH_CARD_POPUP_DETAIL,
  });

  setHidden('status', view.kind === 'results');
  setHidden('list-head', false);
  setText('alternatives-heading', ALTERNATIVES_HEADING);

  if (view.kind === 'results') {
    wireRouteRows(deps);

    return;
  }

  const retry = roleElement('retry');

  if (retry !== null) {
    retry.onclick = (): void => deps.reload();
  }
}

/** One branch per state, and every branch paints the whole window. */
export function renderMain(state: PopupState, deps: PopupDeps): void {
  clearMain();
  setReportHref(state.view);

  switch (state.view.kind) {
    case 'no-site': {
      setText('status', NO_SITE_NOTICE);
      setHidden('status', false);

      const section = roleElement('alternatives');

      if (section !== null) {
        section.dataset.state = 'no-site';
      }

      return;
    }
    case 'off': {
      if (state.view.site !== null) {
        renderCard(
          state.view.site.domain,
          headline(state.view.site.name, state.view.site.walls.length),
        );
        renderSiteWalls(state.view.site);
      }

      return;
    }
    case 'unlisted':
      renderCard(state.view.domain, SITE_NOT_LISTED);
      renderReportRow(state.view.report, 1);
      renderUnlistedSearch(state.view.query, 2);

      return;
    case 'results':
    case 'empty':
    case 'error': {
      const site = state.view.site;

      renderCard(site.domain, headline(site.name, site.walls.length));
      renderSiteWalls(site);
      renderList(state.view, state, deps);

      return;
    }
  }
}

export function clearMain(): void {
  setHidden('source', true);
  setHidden('site-report', true);
  setHidden('walls-row', true);
  setHidden('walls-detail', true);
  setHidden('status', true);
  setHidden('list-head', true);
  setHidden('search', true);
  setHidden('fallback', true);
  setHidden('retry-row', true);
  setText('status', '');
  setText('alternatives-heading', '');

  const list = roleElement('list');

  list?.replaceChildren();
}
