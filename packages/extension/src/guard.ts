import { GUARD_TIMEOUT_MS, MESSAGE } from './constants';
import { GUARD_LINK_LABEL } from './copy';
import { devLog } from './log';
import type { BlockedMessage, IsBlockedMessage } from './messages';
import { isBlockedNavigationResponse, isIsBlockedResponse } from './messages';

devLog('guard', 'the guard is loaded');

/**
 * One document gets one decision. The marker is module state, so the page
 * neither reads nor overwrites it, and it is not an attribute, a `dataset`
 * entry, or any other value a publisher's script could reach.
 */
let ran = false;

const TIMED_OUT = Symbol('the guard timed out');

function hideDocument(): void {
  // The important rule is what beats a publisher's own visibility rule.
  document.documentElement.style.setProperty('visibility', 'hidden', 'important');
}

function restoreDocument(): void {
  document.documentElement.style.removeProperty('visibility');
}

function askWorker(message: IsBlockedMessage | BlockedMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/**
 * The worker's answer, or the timeout marker when the wait runs out first. The
 * timer is cleared as soon as the race settles, so a slow worker leaves no
 * timer behind, and an answer that arrives after the timeout acts on nothing.
 */
async function askWithinTimeout(message: IsBlockedMessage): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), GUARD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([askWorker(message), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * The one element the guard draws, and only when the worker could not navigate
 * the stopped document. It is built from the worker's answer, so the reader can
 * still reach the block page.
 */
function appendBlockPageLink(blockPageUrl: string): void {
  const parent = document.body ?? document.documentElement;
  const link = document.createElement('a');

  link.href = blockPageUrl;
  link.textContent = GUARD_LINK_LABEL;
  parent.append(link);
}

/**
 * Decides whether the document may load. The document is hidden before the
 * first question, and every path that does not stop it removes the rule again,
 * so a guard error, a timeout, a missing list, or an unlisted page fails open.
 */
export async function runGuard(href = location.href): Promise<void> {
  if (ran) {
    return;
  }

  ran = true;

  hideDocument();

  let answer: unknown;

  try {
    answer = await askWithinTimeout({ type: MESSAGE.isBlocked, url: href });
  } catch {
    restoreDocument();

    return;
  }

  if (answer === TIMED_OUT || !isIsBlockedResponse(answer) || !answer.blocked) {
    restoreDocument();

    return;
  }

  window.stop();

  let navigation: unknown;

  try {
    navigation = await askWorker({ type: MESSAGE.blocked, url: href });
  } catch {
    restoreDocument();

    return;
  }

  if (!isBlockedNavigationResponse(navigation)) {
    restoreDocument();

    return;
  }

  if (navigation.ok) {
    // The tab is on its way to the block page, so the hidden document stays hidden.
    return;
  }

  restoreDocument();

  if (typeof navigation.blockPageUrl === 'string') {
    appendBlockPageLink(navigation.blockPageUrl);
  }
}
