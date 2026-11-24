import { MESSAGE } from './constants';
import {
  CACHE_CONFIRM,
  CACHE_DETAIL,
  CACHE_HEADING,
  CLEAR_CACHE_LABEL,
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

  if (button === null) {
    return;
  }

  button.onclick = (): void => {
    if (!window.confirm(CACHE_CONFIRM)) {
      return;
    }

    setHidden('cache-status', true);

    sender.guard(async () => {
      const answer: unknown = await chrome.runtime.sendMessage({ type: MESSAGE.clearCache });

      if (!isClearCacheResponse(answer)) {
        return;
      }

      setText('cache-status', cacheCleared(answer.cleared));
      setHidden('cache-status', false);
    });
  };
}
