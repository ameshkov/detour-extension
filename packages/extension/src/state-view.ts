import type { ListedSite, SitesJson, Wall } from '@detour/shared';
import { registrableDomain } from '@detour/shared';

import type { Alternative, AlternativesAnswer, MatchKind } from './alternatives';
import { findSite } from './list-matching';
import type { PageMeta } from './metadata';
import { hostOf, isWebUrl } from './page-url';
import type { ScopeChoice, ScopeDefaults } from './scope-defaults';
import { defaultScopeFor } from './scope-defaults';
import { fallbackQuery } from './search-fallback';
import type { Settings } from './storage';

/** The wall verdict of one route, computed against the list in use. */
export type RouteWalls = 'none' | 'listed' | 'unknown';

/** The list entry as a surface shows it. */
export type ListedSiteView = {
  domain: string;
  name: string;
  walls: Wall[];
  verified?: string;
  note: string;
};

/** The popup adds the tab it answers for. */
export type PopupSite = ListedSiteView & { tabId: number; url: string };

/** A route as a surface shows it. */
export type RouteView = {
  title: string;
  description: string;
  domain: string;
  url: string;
  favicon: string | null;
  walls: RouteWalls;
  /** How closely the row matches the story, or null when the analysis gave none. */
  match: MatchKind | null;
};

/** A report link needs the page and the list. */
export type ReportView = { url: string; listId: string };

export type PopupView =
  | { kind: 'off'; site: PopupSite | null }
  | { kind: 'no-site' }
  | { kind: 'unlisted'; domain: string; query: string; report: ReportView }
  | {
      kind: 'results';
      site: PopupSite;
      routes: RouteView[];
      searchCard: boolean;
      query: string;
      /** The wall detail's report names the page and the list, as the block page's does. */
      report: ReportView;
    }
  | { kind: 'empty'; site: PopupSite; query: string; report: ReportView }
  | { kind: 'error'; site: PopupSite; query: string; report: ReportView };

export type PageView =
  | { kind: 'no-url' }
  | { kind: 'unavailable' }
  | {
      kind: 'results';
      site: ListedSiteView | null;
      meta: PageMeta | null;
      routes: RouteView[];
      searchCard: boolean;
      /** The story of the article, or null when the analysis gave none. */
      topic: string | null;
      query: string;
      scope: ScopeChoice;
      report: ReportView;
    }
  | {
      kind: 'empty';
      site: ListedSiteView | null;
      meta: PageMeta | null;
      query: string;
      scope: ScopeChoice;
      report: ReportView;
    }
  | {
      kind: 'error';
      site: ListedSiteView | null;
      meta: PageMeta | null;
      query: string;
      scope: ScopeChoice;
      report: ReportView;
    };

/** Each surface paints the theme from the settings, so both states carry them. */
export type PopupState = { settings: Settings; view: PopupView };
export type PageState = { settings: Settings; view: PageView };

/** The terminal answer of a search, or the failure that stands in for one. */
export function stateOf(answer: AlternativesAnswer | null): 'results' | 'empty' | 'error' {
  if (answer === null || answer.degraded) {
    return 'error';
  }

  return answer.alternatives.length === 0 ? 'empty' : 'results';
}

function listedSiteView(entry: ListedSite | null): ListedSiteView | null {
  if (entry === null) {
    return null;
  }

  return {
    domain: entry.domain,
    name: entry.name,
    walls: entry.walls,
    verified: entry.verified,
    note: entry.note ?? '',
  };
}

/**
 * The verdict of one route: the list carries no wall for that exact address, or
 * it does, or it could not be read. A route earns the badge only for `none`.
 */
function routeWalls(list: SitesJson | null, url: string): RouteWalls {
  if (list === null) {
    return 'unknown';
  }

  return findSite(list, url) === null ? 'none' : 'listed';
}

/** One row per alternative, with its wall verdict computed here and never in a page. */
export function routeViews(answer: AlternativesAnswer | null, list: SitesJson | null): RouteView[] {
  const rows = answer === null ? [] : answer.alternatives;

  return rows.map((alternative: Alternative) => ({
    title: alternative.title,
    description: alternative.description,
    domain: alternative.domain,
    url: alternative.url,
    favicon: alternative.favicon ?? null,
    walls: routeWalls(list, alternative.url),
    match: alternative.match,
  }));
}

export type PopupInput = {
  settings: Settings;
  list: SitesJson | null;
  listId: string;
  /** The tab the popup was opened from, or null when the runtime could not name it. */
  tab: { id: number; url: string } | null;
  meta: PageMeta | null;
  answer: AlternativesAnswer | null;
};

/**
 * The popup's one answer. A reader who switched Detour off sees the switch and
 * the site and no search: a search there would contradict the switch. Otherwise
 * the site decides between the unlisted card and the routes.
 */
export function popupView(input: PopupInput): PopupView {
  const site =
    input.tab === null || input.list === null ? null : findSite(input.list, input.tab.url);
  const view = listedSiteView(site);

  if (!input.settings.enabled) {
    return {
      kind: 'off',
      site:
        view === null || input.tab === null
          ? null
          : { ...view, tabId: input.tab.id, url: input.tab.url },
    };
  }

  if (input.tab === null) {
    return { kind: 'no-site' };
  }

  const url = input.tab.url;

  if (view === null || site === null) {
    const domain = registrableDomain(url) || hostOf(url);

    if (domain === '' || domain === null) {
      return { kind: 'no-site' };
    }

    return {
      kind: 'unlisted',
      domain,
      query: fallbackQuery({ answer: null, meta: null, url, siteName: null, edited: '' }),
      report: { url, listId: input.listId },
    };
  }

  const popupSite: PopupSite = { ...view, tabId: input.tab.id, url };
  const query = fallbackQuery({
    answer: input.answer,
    meta: input.meta,
    url,
    siteName: site.name,
    edited: '',
  });
  const state = stateOf(input.answer);

  const report: ReportView = { url, listId: input.listId };

  if (state === 'error') {
    return { kind: 'error', site: popupSite, query, report };
  }

  if (state === 'empty') {
    return { kind: 'empty', site: popupSite, query, report };
  }

  const routes = routeViews(input.answer, input.list);

  return { kind: 'results', site: popupSite, routes, searchCard: routes.length > 0, query, report };
}

export type PageInput = {
  url: string;
  list: SitesJson | null;
  listId: string;
  settings: Settings;
  scopeDefaults: ScopeDefaults;
  meta: PageMeta | null;
  answer: AlternativesAnswer | null;
};

/**
 * The block page's one answer. A URL that is not a web address has no page to
 * describe, and the reader who opened that page gets the explanation alone.
 */
export function pageView(input: PageInput): PageView {
  if (!isWebUrl(input.url)) {
    return { kind: 'no-url' };
  }

  const site = input.list === null ? null : findSite(input.list, input.url);
  const entry = listedSiteView(site);
  const url = input.url;
  const meta = input.meta;
  const report: ReportView = { url, listId: input.listId };
  const scope = entry === null ? 'tab' : defaultScopeFor(input.scopeDefaults, entry.domain);
  const query = fallbackQuery({
    answer: input.answer,
    meta,
    url,
    siteName: entry?.name ?? null,
    edited: '',
  });
  const state = stateOf(input.answer);

  if (state === 'error') {
    return { kind: 'error', site: entry, meta, query, scope, report };
  }

  if (state === 'empty') {
    return { kind: 'empty', site: entry, meta, query, scope, report };
  }

  const routes = routeViews(input.answer, input.list);

  return {
    kind: 'results',
    site: entry,
    meta,
    routes,
    searchCard: routes.length > 0,
    topic: input.answer?.topic ?? null,
    query,
    scope,
    report,
  };
}
