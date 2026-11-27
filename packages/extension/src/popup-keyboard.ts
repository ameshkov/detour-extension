import { roleElement } from './dom';
import { SEARCH_ENGINES, selectEngine } from './search-fallback';

const CONTROL = 'a, button, input, [role="menuitem"]';

/** The keyboard selection of the popup, cleared on every render. */
let selected: HTMLElement | null = null;

/** The listener of the run that owns the document, replaced on every render. */
let keyboard: ((event: KeyboardEvent) => void) | null = null;

function visible(role: string): HTMLElement | null {
  const element = roleElement(role);

  return element !== null && !element.hidden ? element : null;
}

/**
 * The stops in visual order: the report row, the routes, and the search card. A
 * hidden row is not a stop, so a state that hides one never answers its digit.
 */
function rowStops(): HTMLAnchorElement[] {
  const selector = '[data-role="site-report"], [data-role="list"] > li > a, [data-role="search"]';

  return [...document.querySelectorAll<HTMLAnchorElement>(selector)].filter(
    (element) => !element.hidden,
  );
}

function engineStops(): HTMLAnchorElement[] {
  const box = visible('fallback');
  const engines = box === null ? null : roleElement('engines');

  return engines === null ? [] : [...engines.querySelectorAll<HTMLAnchorElement>('a')];
}

/** The digit that a stop promises, read from the cap that a render wrote. */
function keyOf(stop: HTMLElement): string | null {
  const cap = stop.querySelector<HTMLElement>(
    '[data-role="report-key"], [data-role="result-key"], [data-role="search-key"], [data-role="engine-key"]',
  );

  return cap === null ? null : cap.textContent;
}

function paint(stops: HTMLElement[], index: number): void {
  for (const stop of stops) {
    delete stop.dataset.selected;
  }

  selected = stops[index] ?? null;
  selected?.setAttribute('data-selected', 'true');
  selected?.scrollIntoView?.({ block: 'nearest' });
}

/** Enter, a digit, and a click all end in the row's own press. */
function open(index: number, stops: HTMLElement[]): void {
  const stop = stops[index];

  if (stop === undefined) {
    return;
  }

  selected = null;
  stop.click();
}

/**
 * The block page's keys, over the popup's rows: a digit opens the row whose cap
 * it names, the arrows move the selection, and Enter opens the selection or the
 * first row. In the engines the same keys pick an engine instead, because that
 * is what the caps in the box promise. A focused control keeps Enter, and Escape
 * stays the browser's, which closes the popup.
 */
export function installPopupKeyboard(): void {
  if (keyboard !== null) {
    document.removeEventListener('keydown', keyboard);
  }

  selected = null;

  keyboard = (event: KeyboardEvent): void => {
    if (event.isComposing) {
      return;
    }

    const engines = engineStops();
    const stops = engines.length > 0 ? engines : rowStops();
    const target = event.target instanceof Element ? event.target : null;
    const control = target === null ? null : target.closest(CONTROL);
    const rows = engines.length === 0;
    const current = stops.findIndex((stop) => stop.dataset.selected === 'true');

    if (/^[1-9]$/.test(event.key)) {
      const index = stops.findIndex((stop) => keyOf(stop) === event.key);

      event.preventDefault();

      if (index === -1) {
        return;
      }

      // An engine waits for Enter, so a digit only moves the choice there.
      if (rows) {
        open(index, stops);
      } else if (index < SEARCH_ENGINES.length) {
        selectEngine(index);
      }

      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const index =
        current === -1
          ? step === 1
            ? 0
            : stops.length - 1
          : Math.min(Math.max(current + step, 0), stops.length - 1);

      event.preventDefault();

      if (rows) {
        paint(stops, index);
      } else {
        selectEngine(index);
      }

      return;
    }

    if (event.key === 'Enter' && control === null) {
      event.preventDefault();

      if (rows) {
        open(current === -1 ? 0 : current, stops);
      }
    }
  };

  document.addEventListener('keydown', keyboard);
}
