import type { Wall } from '@detour/shared';

import { isPageMeta } from './metadata';
import type { ScopeChoice } from './scope-defaults';
import { isScopeChoice } from './scope-defaults';
import type {
  ListedSiteView,
  PageState,
  PageView,
  PopupSite,
  PopupState,
  PopupView,
  ReportView,
  RouteView,
} from './state-view';
import { isSettings } from './storage';
import { WALL_TYPES, isWallCategory } from './walls';

/**
 * A view arrives from the worker, which is our own code, but a message answer is
 * still data: a surface paints only a value that carries every field it reads.
 * A field of the wrong type is a refusal, and the surface falls back.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWall(value: unknown): value is Wall {
  return (
    isRecord(value) &&
    isWallCategory(value.category) &&
    WALL_TYPES.includes(value.type as Wall['type'])
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isReport(value: unknown): value is ReportView {
  return isRecord(value) && isString(value.url) && isString(value.listId);
}

function isSiteView(value: unknown): value is ListedSiteView {
  return (
    isRecord(value) &&
    isString(value.domain) &&
    isString(value.name) &&
    Array.isArray(value.walls) &&
    value.walls.every(isWall) &&
    isString(value.note) &&
    (value.verified === undefined || isString(value.verified))
  );
}

function isPopupSite(value: unknown): value is PopupSite {
  if (!isRecord(value) || !isSiteView(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record.tabId === 'number' && typeof record.url === 'string';
}

function isRoute(value: unknown): value is RouteView {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isString(value.description) &&
    isString(value.domain) &&
    isString(value.url) &&
    (value.favicon === null || isString(value.favicon)) &&
    (value.walls === 'none' || value.walls === 'listed' || value.walls === 'unknown')
  );
}

function isRoutes(value: unknown): value is RouteView[] {
  return Array.isArray(value) && value.every(isRoute);
}

function isMeta(value: unknown): boolean {
  return value === null || isPageMeta(value);
}

function isScopeChoiceValue(value: unknown): value is ScopeChoice {
  return isScopeChoice(value);
}

function isPopupView(value: unknown): value is PopupView {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.kind) {
    case 'off':
      return value.site === null || isPopupSite(value.site);
    case 'no-site':
      return true;
    case 'unlisted':
      return isString(value.domain) && isString(value.query) && isReport(value.report);
    case 'results':
      return (
        isPopupSite(value.site) &&
        isRoutes(value.routes) &&
        typeof value.searchCard === 'boolean' &&
        isString(value.query) &&
        isReport(value.report)
      );
    case 'empty':
    case 'error':
      return isPopupSite(value.site) && isString(value.query) && isReport(value.report);
    default:
      return false;
  }
}

function isPageView(value: unknown): value is PageView {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.kind) {
    case 'no-url':
    case 'unavailable':
      return true;
    case 'results':
      return (
        (value.site === null || isSiteView(value.site)) &&
        isMeta(value.meta) &&
        isRoutes(value.routes) &&
        typeof value.searchCard === 'boolean' &&
        isString(value.query) &&
        isScopeChoiceValue(value.scope) &&
        isReport(value.report)
      );
    case 'empty':
    case 'error':
      return (
        (value.site === null || isSiteView(value.site)) &&
        isMeta(value.meta) &&
        isString(value.query) &&
        isScopeChoiceValue(value.scope) &&
        isReport(value.report)
      );
    default:
      return false;
  }
}

export function isPopupState(value: unknown): value is PopupState {
  return isRecord(value) && isSettings(value.settings) && isPopupView(value.view);
}

export function isPageState(value: unknown): value is PageState {
  return isRecord(value) && isSettings(value.settings) && isPageView(value.view);
}
