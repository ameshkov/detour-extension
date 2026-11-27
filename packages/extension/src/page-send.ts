import { devLog } from './log';
import type { RevokeMessage, SetSettingsMessage } from './messages';

export type PageScope = 'block' | 'popup' | 'options';

export type SettingsMessage = RevokeMessage | SetSettingsMessage;

export type PageSender = {
  send(message: SettingsMessage, reload: () => void): void;
  guard(work: () => Promise<unknown>, after?: () => void): void;
};

/**
 * One sender per page: a failure is logged under the page's scope, and the
 * reload that follows renders what the service worker stored, whether or not it
 * answered.
 */
export function createPageSender(scope: PageScope): PageSender {
  const logFailure = (error: unknown): void => {
    devLog(scope, 'the message failed', error);
  };

  /** The sync catch covers an invalidated context, the promise catch a later failure. */
  const guard = (work: () => Promise<unknown>, after?: () => void): void => {
    const settle = (): void => after?.();

    try {
      void Promise.resolve(work()).catch(logFailure).finally(settle);
    } catch (error) {
      logFailure(error);
      settle();
    }
  };

  const send = (message: SettingsMessage, reload: () => void): void => {
    guard(() => chrome.runtime.sendMessage(message), reload);
  };

  return { send, guard };
}
