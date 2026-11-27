import type { Send } from './popup-data';
import { defaultSend, requestPopupState } from './popup-data';
import { installPopupKeyboard } from './popup-keyboard';
import {
  renderFooter,
  renderShell,
  renderState,
  renderSwitch,
  renderUnavailable,
  showControls,
} from './popup-frame';
import { renderMain } from './popup-sections';
import type { PopupState } from './state-view';
import { applyTheme } from './theme';

/** Everything a render needs beyond the state: one sender and the two ways out. */
export type PopupDeps = {
  send: Send;
  guard: (work: () => Promise<unknown>, after?: () => void) => void;
  close: () => void;
  openOptions: () => void;
  reload: () => void;
};

export type PopupOptions = {
  send?: Send;
  close?: () => void;
  openOptions?: () => void;
};

export function renderPopup(state: PopupState, deps: PopupDeps): void {
  applyTheme(state.settings.theme);
  showControls();
  renderState(state.settings);
  renderSwitch(state, deps);
  renderMain(state, deps);
  renderFooter(state, deps);
  installPopupKeyboard();
}

/** The sync catch covers an invalidated context, the promise catch a later failure. */
function guard(work: () => Promise<unknown>, after?: () => void): void {
  const settle = (): void => after?.();

  try {
    void Promise.resolve(work())
      .catch(() => undefined)
      .finally(settle);
  } catch {
    settle();
  }
}

/**
 * One state request, then one render. Every write sends a message and asks for
 * the state again, so the popup shows what the worker stored and never paints an
 * optimistic value.
 */
export async function startPopup(options: PopupOptions = {}): Promise<void> {
  const send = options.send ?? defaultSend;
  const close = options.close ?? ((): void => window.close());
  const openOptions =
    options.openOptions ??
    ((): void => {
      guard(() => chrome.runtime.openOptionsPage());
    });

  let load = async (): Promise<void> => undefined;

  const deps: PopupDeps = {
    send,
    guard,
    close,
    openOptions,
    reload: (): void => void load(),
  };

  load = async (): Promise<void> => {
    renderShell(deps);

    const state = await requestPopupState(send);

    if (state === null) {
      renderUnavailable(deps);

      return;
    }

    renderPopup(state, deps);
  };

  await load();
}
