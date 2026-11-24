import type { AlternativesAnswer } from './alternatives';
import { startCountdown } from './auto-open';
import { renderActions } from './block-actions';
import { askMeta, loadAnswer, readPageState } from './block-data';
import type { AlternativesState } from './block-results';
import { renderAlternatives } from './block-results';
import { originalUrl, renderExplanation, renderListEntry, renderSourceCard } from './block-shell';
import { roleElement, setHidden } from './dom';
import { findSite } from './list-matching';
import type { PageMeta } from './metadata';
import { hostOf, isWebUrl } from './page-url';
import { fallbackQuery, readFallbackQuery } from './search-fallback';
import { startSlowNote } from './slow-note';

export type BlockPageOptions = {
  search: string;
  now?: number;
  navigate?: (url: string) => void;
  openTab?: (url: string) => void;
};

const INTERACTIVE = 'a, button, input, textarea, select, [role="menuitem"]';

/** The one Enter shortcut of the document, replaced when the page starts again. */
let enterShortcut: ((event: KeyboardEvent) => void) | null = null;

/** The stopper of the countdown that runs, so Enter and a second start can stop it. */
let stopCountdown: (() => void) | null = null;

/** The note of the run that owns the document, cleared when that run retires. */
let clearNote: (() => void) | null = null;

/**
 * The run that owns the document. A start retires the run before it, so an
 * answer, a note timer, or a countdown of the old run cannot paint a document
 * that a new run or a teardown now owns.
 */
let pageRun = 0;

/** Retires the run that owns the document and stops what it left running. */
export function stopBlockPage(): void {
  pageRun += 1;
  stopCountdown?.();
  stopCountdown = null;
  clearNote?.();
  clearNote = null;
}

function installEnterShortcut(openTab: (url: string) => void): void {
  if (enterShortcut !== null) {
    document.removeEventListener('keydown', enterShortcut);
  }

  enterShortcut = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') {
      return;
    }

    if (event.target instanceof Element && event.target.closest(INTERACTIVE) !== null) {
      return;
    }

    const link = roleElement('list')?.querySelector<HTMLAnchorElement>('a');

    if (link === null || link === undefined) {
      return;
    }

    stopCountdown?.();
    openTab(link.href);
  };

  document.addEventListener('keydown', enterShortcut);
}

/** A degraded answer is a search that did not finish, never an empty result. */
function stateOf(answer: AlternativesAnswer | null): AlternativesState {
  if (answer === null || answer.degraded) {
    return 'error';
  }

  return answer.alternatives.length === 0 ? 'empty' : 'results';
}

/** Fills the page from the query, the list, the metadata, and the alternatives. */
export async function startBlockPage(options: BlockPageOptions): Promise<void> {
  // A foreign document must not frame the page and aim it at a publisher.
  if (window.top !== window.self) {
    return;
  }

  stopBlockPage();

  const run = pageRun;

  const original = originalUrl(options.search);
  const now = options.now ?? Date.now();
  const navigate = options.navigate ?? ((url: string): void => location.assign(url));
  const openTab =
    options.openTab ?? ((url: string): void => void window.open(url, '_blank', 'noreferrer'));

  renderExplanation(original);
  installEnterShortcut(openTab);

  if (original === null) {
    setHidden('alternatives', true);
  }

  const { list, listId, settings } = await readPageState();

  renderListEntry(list, original);

  const site = list === null || original === null ? null : findSite(list, original);

  renderActions({
    original,
    siteName: site?.name ?? null,
    host: site?.domain ?? hostOf(original),
    listed: site !== null,
    listId,

    navigate,
  });

  if (original === null) {
    return;
  }

  const siteName = site?.name ?? null;
  const retry = roleElement('retry');
  const metaPromise = askMeta(original);
  let meta: PageMeta | null = null;
  let loading = false;

  /** The note starts after the list read, so its labels can name the site. */
  const startNote = (): void => {
    if (original === null || !isWebUrl(original)) {
      return;
    }

    clearNote = startSlowNote({ siteName, url: original, navigate, listed: site !== null });
  };

  startNote();

  const setRetryDisabled = (disabled: boolean): void => {
    if (retry instanceof HTMLButtonElement) {
      retry.disabled = disabled;
    }
  };

  const render = (state: AlternativesState, answer: AlternativesAnswer | null): void => {
    if (run !== pageRun) {
      return;
    }

    renderAlternatives({
      state,
      answer,
      imagesEnabled: settings.imagesEnabled,
      query: fallbackQuery({ answer, meta, url: original, siteName, edited: readFallbackQuery() }),
    });
  };

  /** The best match opens by itself only when the reader asked for it. */
  const autoOpen = (answer: AlternativesAnswer | null): void => {
    stopCountdown?.();
    const best = answer !== null && !answer.degraded ? answer.alternatives[0] : undefined;

    stopCountdown =
      settings.autoOpenBest && best !== undefined
        ? startCountdown({ url: best.url, domain: best.domain, navigate })
        : null;
  };

  const search = async (): Promise<void> => {
    if (run !== pageRun) {
      return;
    }

    loading = true;
    setRetryDisabled(true);

    try {
      const answer = await loadAnswer({
        url: original,
        meta: metaPromise,
        now,
        retired: () => run !== pageRun,
      });

      meta = await metaPromise.catch(() => null);
      render(stateOf(answer), answer);

      if (run === pageRun) {
        autoOpen(answer);
      }
    } catch {
      render('error', null);
    } finally {
      if (run === pageRun) {
        clearNote?.();
        clearNote = null;
        loading = false;
        setRetryDisabled(false);
      }
    }
  };

  if (retry instanceof HTMLButtonElement) {
    retry.onclick = (): void => {
      if (run !== pageRun || loading) {
        return;
      }

      clearNote?.();
      render('loading', null);
      startNote();
      void search();
    };
  }

  const card = metaPromise.then((answer) => {
    if (run === pageRun) {
      renderSourceCard(answer);
    }
  });

  await Promise.all([card, search()]);
}
