import { COPIED_ADDRESS_LABEL, COPY_ADDRESS_LABEL, COPY_FAILED_LABEL } from './copy';
import { roleElement, setText } from './dom';

/** How long the button keeps the copied state before it offers the press again. */
const COPIED_MS = 2000;

/** The timer of the run that owns the document, cleared when the page retires. */
let resetTimer: ReturnType<typeof setTimeout> | null = null;

function stopReset(): void {
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
}

function markCopied(button: HTMLElement): void {
  button.dataset.copied = 'true';
  button.setAttribute('aria-label', COPIED_ADDRESS_LABEL);
  setText('copy-status', COPIED_ADDRESS_LABEL);
  stopReset();

  resetTimer = setTimeout(() => {
    resetTimer = null;
    delete button.dataset.copied;
    button.setAttribute('aria-label', COPY_ADDRESS_LABEL);
    setText('copy-status', '');
  }, COPIED_MS);
}

async function copy(text: string, button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    setText('copy-status', COPY_FAILED_LABEL);

    return;
  }

  markCopied(button);
}

/** Stops the copied state of a page that a new run or a teardown replaced. */
export function stopCopyAddress(): void {
  stopReset();
}

/**
 * The copy control beside the address. It takes the whole address, not the
 * shortened line, and a press marks the button until the timer clears it. A
 * browser without the clipboard API gets the failure text and no mark.
 */
export function renderCopyAddress(original: string | null): void {
  const button = roleElement('copy');

  if (button === null) {
    return;
  }

  stopReset();
  delete button.dataset.copied;
  button.hidden = original === null;
  button.setAttribute('aria-label', COPY_ADDRESS_LABEL);
  setText('copy-status', '');
  button.onclick = null;

  if (original === null) {
    return;
  }

  button.onclick = (): void => {
    void copy(original, button);
  };
}
