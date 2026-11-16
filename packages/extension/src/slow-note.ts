import { KEEP_WAITING_LABEL, SLOW_NOTE, openInsteadLabel } from './copy';
import { SLOW_NOTE_MS } from './constants';
import { roleElement, setHidden, setText } from './dom';
import { openSite } from './open-site';
import { hostOf } from './page-url';

export type SlowNoteInput = {
  siteName: string | null;
  url: string;
  navigate: (url: string) => void;
  listed: boolean;
};

/**
 * The note that offers the reader a way out while the search runs. It starts
 * with the search, so the three seconds belong to the wait. The answer, a
 * retry, or `Keep waiting` clears it.
 */
export function startSlowNote(input: SlowNoteInput): () => void {
  const section = roleElement('alternatives');
  const openInstead = roleElement('open-instead');
  const keepWaiting = roleElement('keep-waiting');

  setText('slow-text', SLOW_NOTE);
  setText('open-instead', openInsteadLabel(input.siteName ?? hostOf(input.url) ?? input.url));
  setText('keep-waiting', KEEP_WAITING_LABEL);
  setHidden('slow-note', true);

  const timer = setTimeout((): void => {
    section?.setAttribute('data-slow', 'true');
    setHidden('slow-note', false);
  }, SLOW_NOTE_MS);

  const clear = (): void => {
    clearTimeout(timer);
    section?.removeAttribute('data-slow');
    setHidden('slow-note', true);

    if (openInstead !== null) {
      openInstead.onclick = null;
    }

    if (keepWaiting !== null) {
      keepWaiting.onclick = null;
    }
  };

  if (openInstead !== null) {
    openInstead.onclick = (): void => {
      void openSite({
        scope: 'tab',
        url: input.url,
        navigate: input.navigate,
        listed: input.listed,
      });
    };
  }

  if (keepWaiting !== null) {
    keepWaiting.onclick = (): void => {
      clear();
    };
  }

  return clear;
}
