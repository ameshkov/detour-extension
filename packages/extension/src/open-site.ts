import type { AllowanceScope } from './allowances';
import { MESSAGE } from './constants';
import { ACTION_ERROR, PASS_ERROR } from './copy';
import { setHidden, setText } from './dom';
import { devLog } from './log';
import type { AllowMessage, PassMessage } from './messages';
import { isAllowanceResponse, isPassResponse } from './messages';

/** `once` opens the page and writes nothing, so it is not an allowance. */
export type OpenSiteKind = AllowanceScope | 'once';

export type OpenSiteInput = {
  kind: OpenSiteKind;
  url: string;
  navigate: (url: string) => void;
  /** A listed URL needs a record. Any other URL opens at once. */
  listed: boolean;
};

/**
 * The bound on the message that records the open. A cold service worker needs
 * time to wake, so the page waits for the stored answer and only a late answer
 * gives up.
 */
const ALLOW_TIMEOUT_MS = 1500;

function messageOf(input: OpenSiteInput): AllowMessage | PassMessage {
  return input.kind === 'once'
    ? { type: MESSAGE.pass, url: input.url }
    : { type: MESSAGE.allow, scope: input.kind, url: input.url };
}

/**
 * One `allow` or `pass` message and the stored answer. The service worker reads
 * the tab from the sender, so the page sends no tab id at all. A message that
 * fails or does not answer inside the bound answers false.
 */
async function recordOpen(input: OpenSiteInput): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const send = async (): Promise<unknown> => {
    return chrome.runtime.sendMessage(messageOf(input));
  };

  const bound = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ALLOW_TIMEOUT_MS);
  });

  try {
    const answer = await Promise.race([send(), bound]);

    return input.kind === 'once' ? isPassResponse(answer) : isAllowanceResponse(answer);
  } catch (error) {
    devLog('actions', 'the open message failed', error);

    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A listed site opens after its allowance or its one-time pass is stored, and
 * not before. An unlisted URL needs neither, so it opens at once. A failed or
 * late write keeps the page and shows the action error.
 */
export async function openSite(input: OpenSiteInput): Promise<void> {
  if (!input.listed) {
    input.navigate(input.url);

    return;
  }

  if (!(await recordOpen(input))) {
    setText('action-error', input.kind === 'once' ? PASS_ERROR : ACTION_ERROR);
    setHidden('action-error', false);

    return;
  }

  input.navigate(input.url);
}
