import type { SitesJson } from '@detour/shared';

import { readAltCache, writeAltCache } from './alts-cache';
import type { AlternativesAnswer } from './alternatives';
import { DEFAULT_SETTINGS, MESSAGE } from './constants';
import { isAlternativesResponse, isGetMetaResponse } from './messages';
import type { PageMeta } from './metadata';
import type { Settings } from './storage';
import { readList, readSettings } from './storage';

export type BlockState = {
  list: SitesJson | null;
  settings: Settings;
};

export type LoadAnswerInput = {
  url: string;
  meta: Promise<PageMeta | null>;
  now: number;
};

/**
 * The metadata of the stopped page, or null when the answer fails or is not one.
 * The page keeps its URL-only card in every failing case. The send starts inside
 * a microtask, so a throw from `sendMessage` becomes a rejection of this promise
 * and never stops the page that called it.
 */
export function askMeta(url: string): Promise<PageMeta | null> {
  if (typeof chrome === 'undefined' || chrome.runtime === undefined) {
    return Promise.resolve(null);
  }

  return Promise.resolve()
    .then(() => chrome.runtime.sendMessage({ type: MESSAGE.getMeta, url }))
    .then((answer: unknown) => (isGetMetaResponse(answer) ? answer.meta : null))
    .catch(() => null);
}

/** The list and the settings, or the defaults when a read fails. */
export async function readPageState(): Promise<BlockState> {
  try {
    const [list, settings] = await Promise.all([readList(), readSettings()]);

    return { list, settings };
  } catch {
    return { list: null, settings: { ...DEFAULT_SETTINGS } };
  }
}

/**
 * One alternatives question for the stopped page. The service worker asks the
 * backend, because it can check the sender's tab and URL; a page that merely
 * opened the block page gets no answer. A message that fails or does not answer
 * one answers null, and the page shows its failure text.
 */
function requestAnswer(url: string, title: string | null): Promise<AlternativesAnswer | null> {
  if (typeof chrome === 'undefined' || chrome.runtime === undefined) {
    return Promise.resolve(null);
  }

  return Promise.resolve()
    .then(() =>
      chrome.runtime.sendMessage({ type: MESSAGE.getAlternatives, url, title: title ?? '' }),
    )
    .then((answer: unknown) => (isAlternativesResponse(answer) ? answer.answer : null))
    .catch(() => null);
}

/**
 * A stored answer renders with no request. Otherwise the service worker is
 * asked once the metadata is at hand, because the title travels with the URL.
 * Only a finished answer is stored: a degraded one is a spent budget, and a
 * day-long copy of it would outlive the budget window.
 */
export async function loadAnswer(input: LoadAnswerInput): Promise<AlternativesAnswer | null> {
  const cached = await readAltCache(input.url, input.now);

  if (cached !== null) {
    return cached;
  }

  const answer = await requestAnswer(input.url, (await input.meta)?.title ?? null);

  if (answer !== null && !answer.degraded) {
    try {
      await writeAltCache(input.url, answer, input.now);
    } catch {
      // A lost cache entry costs one search later, not this answer.
    }
  }

  return answer;
}
