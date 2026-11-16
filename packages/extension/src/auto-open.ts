import { AUTO_OPEN_COUNTDOWN_SECONDS, COUNTDOWN_TICK_MS } from './constants';
import { STAY_LABEL, countdownText } from './copy';
import { setHidden, setText } from './dom';

export type CountdownInput = {
  url: string;
  domain: string;
  navigate: (url: string) => void;
};

/**
 * The countdown before the best match opens by itself. The reader keeps the page
 * with Escape or any click, and both listeners go when it stops, so a stopped
 * countdown never opens a tab later. A second stop is safe: the timer and the
 * listeners are already gone, and the countdown is already hidden.
 */
export function startCountdown(input: CountdownInput): () => void {
  let remaining = AUTO_OPEN_COUNTDOWN_SECONDS;

  setText('countdown-text', countdownText(input.domain));
  setText('countdown-cancel', STAY_LABEL);
  setText('countdown-number', String(remaining));
  setHidden('countdown', false);

  const onDocumentClick = (): void => {
    stop();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      stop();
    }
  };

  const timer = setInterval((): void => {
    remaining -= 1;

    if (remaining > 0) {
      setText('countdown-number', String(remaining));

      return;
    }

    stop();
    input.navigate(input.url);
  }, COUNTDOWN_TICK_MS);

  function stop(): void {
    clearInterval(timer);
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onKeydown);
    setHidden('countdown', true);
  }

  // The capture phase, so a press on any control of the page still stops it.
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onKeydown);

  return stop;
}
