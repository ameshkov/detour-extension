import type { AllowanceScope } from './allowances';
import { MESSAGE } from './constants';
import { ACTION_ERROR } from './copy';
import { setHidden, setText } from './dom';
import { devLog } from './log';
import type { AllowMessage } from './messages';
import { isAllowanceResponse } from './messages';

export type OpenSiteInput = {
  scope: AllowanceScope;
  url: string;
  navigate: (url: string) => void;
  /** A listed URL needs an allowance. Any other URL opens at once. */
  listed: boolean;
};

/**
 * The bound on the allowance message. A cold service worker needs time to wake,
 * so the page waits for the stored answer and only a late answer gives up.
 */
const ALLOW_TIMEOUT_MS = 1500;

/**
 * One `allow` message and the stored answer. The service worker reads the tab
 * from the sender, so the page sends no tab id at all. A message that fails or
 * does not answer inside the bound answers false.
 */
async function storeAllowance(input: OpenSiteInput): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const send = async (): Promise<unknown> => {
    const message: AllowMessage = { type: MESSAGE.allow, scope: input.scope, url: input.url };

    return chrome.runtime.sendMessage(message);
  };

  const bound = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ALLOW_TIMEOUT_MS);
  });

  try {
    const answer = await Promise.race([send(), bound]);

    return isAllowanceResponse(answer);
  } catch (error) {
    devLog('actions', 'the allowance message failed', error);

    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A listed site opens after the allowance is stored, and not before. An unlisted
 * URL needs no allowance, so it opens at once. A failed or late write keeps the
 * page and shows the action error.
 */
export async function openSite(input: OpenSiteInput): Promise<void> {
  if (!input.listed) {
    input.navigate(input.url);

    return;
  }

  if (!(await storeAllowance(input))) {
    setText('action-error', ACTION_ERROR);
    setHidden('action-error', false);

    return;
  }

  input.navigate(input.url);
}
