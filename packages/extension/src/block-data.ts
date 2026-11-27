import { MESSAGE } from './constants';
import { isPageStateResponse } from './messages';
import type { PageState } from './state-view';

/** One message to the worker. A test injects it; the page uses the runtime. */
export type Send = (message: unknown) => Promise<unknown>;

export function defaultSend(message: unknown): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/**
 * The one question the block page asks. The worker answers only the tab that the
 * guard stopped on this URL, so a page that merely opened `block.html` gets
 * nothing; a refused or failed answer is null, and the page keeps its frame.
 */
export async function requestPageState(send: Send, url: string): Promise<PageState | null> {
  try {
    const answer = await send({ type: MESSAGE.pageState, url });

    return isPageStateResponse(answer) ? answer.state : null;
  } catch {
    return null;
  }
}
