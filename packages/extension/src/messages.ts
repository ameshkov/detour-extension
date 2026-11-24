import type { Wall, WallType } from '@detour/shared';

import type { AllowanceScope, AllowanceState } from './allowances';
import type { AlternativesAnswer } from './alternatives';
import { parseAlternativesAnswer } from './alternatives';
import { MESSAGE } from './constants';
import type { PageMeta } from './metadata';
import { isPageMeta } from './metadata';
import type { Settings } from './storage';
import { WALL_TYPES, isWallCategory, isWallSettings } from './walls';

export type MessageError = 'bad_message' | 'missing_tab' | 'navigation_failed' | 'unknown_message';

export type ListedSite = { domain: string; name: string; walls: Wall[] };

export type IsBlockedMessage = { type: 'isBlocked'; url: string };
export type BlockedMessage = { type: 'blocked'; url: string };
export type GetMetaMessage = { type: 'getMeta'; url: string };
export type GetAlternativesMessage = { type: 'getAlternatives'; url: string; title: string };
/** The popup asks the worker to move the tab it was opened from to the alternatives. */
export type ShowAlternativesMessage = { type: 'showAlternatives'; tabId: number; url: string };
export type AllowMessage = {
  type: 'allow';
  scope: AllowanceScope;
  url: string;
};
/** One page opens once, and the tab gets no allowance. */
export type PassMessage = { type: 'pass'; url: string };
export type RevokeMessage = {
  type: 'revoke';
  scope: AllowanceScope;
  host: string;
  tabId?: number;
};
export type SetSettingsMessage = { type: 'setSettings'; settings: Settings };
/** `session` names the pause that the browser ends, and it carries no timestamp. */
export type PauseMessage = { type: 'pause'; until: number; session: boolean };
export type ClearCacheMessage = { type: 'clearCache' };

export type Message =
  | IsBlockedMessage
  | BlockedMessage
  | GetMetaMessage
  | GetAlternativesMessage
  | ShowAlternativesMessage
  | AllowMessage
  | PassMessage
  | RevokeMessage
  | SetSettingsMessage
  | PauseMessage
  | ClearCacheMessage;

export type IsBlockedResponse = { ok: true; blocked: boolean; site: ListedSite | null };
export type BlockedResponse = { ok: boolean; error?: MessageError; blockPageUrl?: string };
export type GetMetaResponse = { ok: true; meta: PageMeta | null };
export type AlternativesResponse =
  { ok: true; answer: AlternativesAnswer | null } | { ok: false; error: MessageError };
export type AllowanceResponse = { ok: true; allowances: AllowanceState };
export type PassResponse = { ok: true };
export type SettingsResponse = { ok: true; settings: Settings };
export type PauseResponse = { ok: true; pauseUntil: number; session: boolean };
export type ClearCacheResponse = { ok: true; cleared: number };

export type MessageResponse =
  | { ok: false; error: MessageError }
  | IsBlockedResponse
  | BlockedResponse
  | GetMetaResponse
  | AlternativesResponse
  | AllowanceResponse
  | PassResponse
  | SettingsResponse
  | PauseResponse
  | ClearCacheResponse;

const SCOPE_VALUES: readonly AllowanceScope[] = ['tab', 'session', 'always'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAllowanceScope(value: unknown): value is AllowanceScope {
  return SCOPE_VALUES.includes(value as AllowanceScope);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.enabled === 'boolean' &&
    typeof value.autoOpenBest === 'boolean' &&
    typeof value.imagesEnabled === 'boolean' &&
    isWallSettings(value.walls)
  );
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
    case MESSAGE.blocked:
    case MESSAGE.getMeta:
      return typeof value.url === 'string' ? { type: value.type, url: value.url } : null;
    case MESSAGE.getAlternatives:
      return typeof value.url === 'string' && typeof value.title === 'string'
        ? { type: MESSAGE.getAlternatives, url: value.url, title: value.title }
        : null;
    case MESSAGE.showAlternatives:
      return typeof value.url === 'string' && typeof value.tabId === 'number'
        ? { type: MESSAGE.showAlternatives, url: value.url, tabId: value.tabId }
        : null;
    case MESSAGE.allow:
      return typeof value.url === 'string' && isAllowanceScope(value.scope)
        ? { type: MESSAGE.allow, scope: value.scope, url: value.url }
        : null;
    case MESSAGE.pass:
      return typeof value.url === 'string' ? { type: MESSAGE.pass, url: value.url } : null;
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
    case MESSAGE.pause:
      return typeof value.until === 'number' && typeof value.session === 'boolean'
        ? { type: MESSAGE.pause, until: value.until, session: value.session }
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

export function isGetMetaResponse(value: unknown): value is GetMetaResponse {
  return isRecord(value) && value.ok === true && (value.meta === null || isPageMeta(value.meta));
}

export function isAlternativesResponse(
  value: unknown,
): value is { ok: true; answer: AlternativesAnswer | null } {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.answer === null || parseAlternativesAnswer(value.answer) !== null)
  );
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
