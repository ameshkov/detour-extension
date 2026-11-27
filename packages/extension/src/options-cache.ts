import { MESSAGE } from './constants';
import {
  CACHE_CONFIRM,
  CACHE_DETAIL,
  CACHE_HEADING,
  CLEAR_CACHE_LABEL,
  CLEARING_LABEL,
  cacheCleared,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import { isClearCacheResponse } from './messages';
import { createPageSender } from './page-send';

const sender = createPageSender('options');

/**
 * The cache section. The reader confirms before a press drops the list, the
 * reads, and the answers, and the count the worker answers is what the page
 * shows. A worker that did not answer leaves the status hidden.
 */
export function renderCache(): void {
  setText('cache-heading', CACHE_HEADING);
  setText('cache-detail', CACHE_DETAIL);
  setText('clear-cache', CLEAR_CACHE_LABEL);

  const button = roleElement('clear-cache');

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.onclick = (): void => {
    if (!window.confirm(CACHE_CONFIRM)) {
      return;
    }

    let answered = false;

    // The worker downloads the list again before it answers, so the press has a
    // state of its own and a slow backend cannot take a second press.
    button.disabled = true;
    setText('cache-status', CLEARING_LABEL);
    setHidden('cache-status', false);

    sender.guard(
      async () => {
        const answer: unknown = await chrome.runtime.sendMessage({ type: MESSAGE.clearCache });

        if (!isClearCacheResponse(answer)) {
          return;
        }

        answered = true;
        setText('cache-status', cacheCleared(answer.cleared));
      },
      () => {
        button.disabled = false;

        if (!answered) {
          setHidden('cache-status', true);
        }
      },
    );
  };
}
