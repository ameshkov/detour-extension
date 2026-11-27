import { MESSAGE } from './constants';
import { isPopupStateResponse } from './messages';
import type { PopupState } from './state-view';

/** One message to the worker. A test injects it; the popup uses the runtime. */
export type Send = (message: unknown) => Promise<unknown>;

export function defaultSend(message: unknown): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/**
 * The popup asks the worker for one state and renders it. A refused or failed
 * answer is null, and the popup shows that it could not read the page instead of
 * painting half a state.
 */
export async function requestPopupState(send: Send): Promise<PopupState | null> {
  try {
    const answer = await send({ type: MESSAGE.popupState });

    return isPopupStateResponse(answer) ? answer.state : null;
  } catch {
    return null;
  }
}

/**
 * The popup cannot navigate the tab it was opened on, so the worker does. The
 * popup closes either way: a failed navigation leaves the reader where they were,
 * and a popup that stays open hides the page they wanted.
 */
export async function openRoute(send: Send, url: string): Promise<void> {
  try {
    await send({ type: MESSAGE.openRoute, url });
  } catch {
    // Nothing to show: the popup is closing on the page it was opened from.
  }
}
