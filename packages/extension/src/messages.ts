import type { Wall, WallType } from '@detour/shared';

import type { AllowanceScope, AllowanceState } from './allowances';
import { MESSAGE } from './constants';
import type { PageMeta } from './metadata';
import { isPageMeta } from './metadata';
import type { ScopeChoice } from './scope-defaults';
import { isScopeChoice } from './scope-defaults';
import { isPageState, isPopupState } from './state-guard';
import type { PageState, PopupState } from './state-view';
import type { Settings } from './storage';
import { isSettings } from './storage';
import { WALL_TYPES, isWallCategory } from './walls';

export type MessageError = 'bad_message' | 'missing_tab' | 'navigation_failed' | 'unknown_message';

export type ListedSite = { domain: string; name: string; walls: Wall[] };

export type IsBlockedMessage = { type: 'isBlocked'; url: string };
/** The head that the guard read from the stopped document, or null. */
export type BlockedMessage = { type: 'blocked'; url: string; meta: PageMeta | null };
/** The popup asks for the state of the page it was opened on. */
export type PopupStateMessage = { type: 'popupState' };
/** The block page asks for the state of the URL it shows. */
export type PageStateMessage = { type: 'pageState'; url: string };
/** The popup moves its tab to a route, because it cannot navigate it itself. */
export type OpenRouteMessage = { type: 'openRoute'; url: string };
export type AllowMessage = {
  type: 'allow';
  scope: AllowanceScope;
  url: string;
};
/** One page opens once, and the tab gets no allowance. */
export type PassMessage = { type: 'pass'; url: string };
/** The reader chose a scope, and the next block page of the domain starts on it. */
export type RememberScopeMessage = { type: 'rememberScope'; url: string; scope: ScopeChoice };
export type RevokeMessage = {
  type: 'revoke';
  scope: AllowanceScope;
  host: string;
  tabId?: number;
};
export type SetSettingsMessage = { type: 'setSettings'; settings: Settings };
export type ClearCacheMessage = { type: 'clearCache' };

export type Message =
  | IsBlockedMessage
  | BlockedMessage
  | PopupStateMessage
  | PageStateMessage
  | OpenRouteMessage
  | AllowMessage
  | PassMessage
  | RememberScopeMessage
  | RevokeMessage
  | SetSettingsMessage
  | ClearCacheMessage;

export type IsBlockedResponse = { ok: true; blocked: boolean; site: ListedSite | null };
export type BlockedResponse = { ok: boolean; error?: MessageError; blockPageUrl?: string };
export type PopupStateResponse =
  { ok: true; state: PopupState } | { ok: false; error: MessageError };
export type PageStateResponse = { ok: true; state: PageState } | { ok: false; error: MessageError };
export type OpenRouteResponse = { ok: true } | { ok: false; error: MessageError };
export type AllowanceResponse = { ok: true; allowances: AllowanceState };
export type PassResponse = { ok: true };
export type RememberScopeResponse = { ok: true };
export type SettingsResponse = { ok: true; settings: Settings };
export type ClearCacheResponse = { ok: true; cleared: number };

export type MessageResponse =
  | { ok: false; error: MessageError }
  | IsBlockedResponse
  | BlockedResponse
  | PopupStateResponse
  | PageStateResponse
  | OpenRouteResponse
  | AllowanceResponse
  | PassResponse
  | RememberScopeResponse
  | SettingsResponse
  | ClearCacheResponse;

const SCOPE_VALUES: readonly AllowanceScope[] = ['tab', 'session', 'always'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAllowanceScope(value: unknown): value is AllowanceScope {
  return SCOPE_VALUES.includes(value as AllowanceScope);
}

/**
 * The message a caller sent, or null when the value is not one: a missing type, a
 * type outside the contract, or a field that type needs and the value lacks.
 */
export function parseMessage(value: unknown): Message | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case MESSAGE.isBlocked:
    case MESSAGE.pageState:
    case MESSAGE.openRoute:
      return typeof value.url === 'string' ? { type: value.type, url: value.url } : null;
    case MESSAGE.blocked: {
      if (typeof value.url !== 'string') {
        return null;
      }

      // A guard that read nothing sends `null`, and an absent field is the same
      // answer: the card falls back to the URL alone.
      const meta = value.meta ?? null;

      return meta === null || isPageMeta(meta)
        ? { type: MESSAGE.blocked, url: value.url, meta: meta as PageMeta | null }
        : null;
    }
    case MESSAGE.popupState:
      return { type: MESSAGE.popupState };
    case MESSAGE.allow:
      return typeof value.url === 'string' && isAllowanceScope(value.scope)
        ? { type: MESSAGE.allow, scope: value.scope, url: value.url }
        : null;
    case MESSAGE.pass:
      return typeof value.url === 'string' ? { type: MESSAGE.pass, url: value.url } : null;
    case MESSAGE.rememberScope:
      return typeof value.url === 'string' && isScopeChoice(value.scope)
        ? { type: MESSAGE.rememberScope, url: value.url, scope: value.scope }
        : null;
    case MESSAGE.revoke: {
      if (typeof value.host !== 'string' || value.host === '' || !isAllowanceScope(value.scope)) {
        return null;
      }

      if (value.tabId !== undefined && typeof value.tabId !== 'number') {
        return null;
      }

      const message = { type: MESSAGE.revoke, scope: value.scope, host: value.host };

      return value.tabId === undefined ? message : { ...message, tabId: value.tabId };
    }
    case MESSAGE.setSettings:
      return isSettings(value.settings)
        ? { type: MESSAGE.setSettings, settings: value.settings }
        : null;
    case MESSAGE.clearCache:
      return { type: MESSAGE.clearCache };
    default:
      return null;
  }
}

function isWall(value: unknown): value is Wall {
  return (
    isRecord(value) && isWallCategory(value.category) && WALL_TYPES.includes(value.type as WallType)
  );
}

/** A wall category and a wall type are both checked by the response that carries them. */
function isListedSite(value: unknown): value is ListedSite {
  return (
    isRecord(value) &&
    typeof value.domain === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.walls) &&
    value.walls.length > 0 &&
    value.walls.every(isWall)
  );
}

export function isIsBlockedResponse(value: unknown): value is IsBlockedResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    typeof value.blocked === 'boolean' &&
    (value.site === null || isListedSite(value.site))
  );
}

/**
 * A navigation answer is the only value a guard may act on: an object whose `ok`
 * is a boolean, whose `error` is a string when present, and whose `blockPageUrl`
 * is a string when present.
 */
export function isBlockedNavigationResponse(value: unknown): value is BlockedResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }

  if (value.error !== undefined && typeof value.error !== 'string') {
    return false;
  }

  return value.blockPageUrl === undefined || typeof value.blockPageUrl === 'string';
}

/** A page renders only a state that carries every field its view needs. */
export function isPopupStateResponse(value: unknown): value is { ok: true; state: PopupState } {
  return isRecord(value) && value.ok === true && isPopupState(value.state);
}

export function isPageStateResponse(value: unknown): value is { ok: true; state: PageState } {
  return isRecord(value) && value.ok === true && isPageState(value.state);
}

/** An open answer says only that the tab is moving. */
export function isOpenRouteResponse(value: unknown): value is OpenRouteResponse {
  return isRecord(value) && typeof value.ok === 'boolean';
}

/** A stored allowance is the only answer that lets a listed site open. */
export function isAllowanceResponse(value: unknown): value is AllowanceResponse {
  return isRecord(value) && value.ok === true && isRecord(value.allowances);
}

/** The pass answer says only that the record is written. */
export function isPassResponse(value: unknown): value is PassResponse {
  return isRecord(value) && value.ok === true;
}

/** The clear answer names how many keys the worker dropped. */
export function isClearCacheResponse(value: unknown): value is ClearCacheResponse {
  return isRecord(value) && value.ok === true && typeof value.cleared === 'number';
}
