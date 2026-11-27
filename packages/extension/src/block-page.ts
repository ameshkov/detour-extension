import { startCountdown } from './auto-open';
import { renderActions } from './block-actions';
import type { Send } from './block-data';
import { defaultSend, requestPageState } from './block-data';
import { renderAlternatives } from './block-results';
import {
  renderExplanation,
  themeFrom,
  renderListEntry,
  renderNotice,
  renderSourceCard,
} from './block-shell';
import { SEARCH_CARD_DETAIL } from './copy';
import { stopCopyAddress } from './copy-address';
import { roleElement, setHidden } from './dom';
import { hostOf, isWebUrl, originalUrl } from './page-url';
import { SEARCH_ENGINES, selectEngine } from './search-fallback';
import { startSlowNote } from './slow-note';
import type { PageState, PageView } from './state-view';
import { applyTheme } from './theme';
import { renderThemeToggle } from './theme-toggle';

export type BlockPageOptions = {
  search: string;
  navigate?: (url: string) => void;
  /** The way back. A test injects it; the page skips the article in history. */
  goBack?: () => void;
  /** The one message to the worker. A test injects it. */
  send?: Send;
};

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
const CONTROL = 'a, button, [role="menuitem"]';

/** The keyboard navigation of the document, replaced when the page starts again. */
let keyboardShortcut: ((event: KeyboardEvent) => void) | null = null;

/** The keyboard selection: a result row, or the search card after the rows. */
let selectedIndex: number | null = null;

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
  stopCopyAddress();

  if (keyboardShortcut !== null) {
    document.removeEventListener('keydown', keyboardShortcut);
    keyboardShortcut = null;
  }

  selectedIndex = null;
}

/**
 * The list answers the keyboard: a digit opens that row, the arrows move the
 * selection over the rows and then the search card, and Enter opens the
 * selection or the first row. A control of the page keeps its own keys, so a
 * key that starts inside one is left alone.
 */
function installKeyboardNavigation(navigate: (url: string) => void, goBack: () => void): void {
  if (keyboardShortcut !== null) {
    document.removeEventListener('keydown', keyboardShortcut);
  }

  /**
   * Esc in the search box puts the reader back on the list: the box and its
   * line leave, the search card returns as the last stop with its ring, and the
   * focus leaves the box, so the arrows walk the alternatives again. The empty
   * and error states show the box without a card, so there Escape keeps its
   * page meaning.
   */
  const closeSearchBox = (): boolean => {
    const box = roleElement('fallback');
    const card = roleElement('search');

    if (roleElement('alternatives')?.dataset.state !== 'results') {
      return false;
    }

    if (box === null || box.hidden || card === null) {
      return false;
    }

    setHidden('fallback', true);
    setHidden('fallback-note', true);
    setHidden('search', false);
    delete box.dataset.selected;

    if (document.activeElement instanceof HTMLElement && box.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    const list = roleElement('list');
    const rows =
      list === null
        ? 0
        : [...list.children].filter((child) => child instanceof HTMLLIElement).length;

    selectedIndex = rows;
    card.setAttribute('data-selected', 'true');

    return true;
  };

  /**
   * Up in the query leaves the box the way Escape does, and lands on the last
   * alternative, which is the step above the box in the list.
   */
  const leaveBoxUp = (): boolean => {
    if (!closeSearchBox()) {
      return false;
    }

    const list = roleElement('list');
    const rows =
      list === null
        ? []
        : [...list.children].filter(
            (child): child is HTMLLIElement => child instanceof HTMLLIElement,
          );
    const last = rows[rows.length - 1] ?? null;

    if (last === null) {
      return true;
    }

    const card = roleElement('search');

    if (card !== null) {
      delete card.dataset.selected;
    }

    selectedIndex = rows.length - 1;
    last.setAttribute('data-selected', 'true');
    last.scrollIntoView?.({ block: 'nearest' });

    return true;
  };

  selectedIndex = null;
  keyboardShortcut = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const box = roleElement('fallback');
    const inBox = event.target instanceof Element && box !== null && box.contains(event.target);

    const editable = event.target instanceof Element && event.target.closest(EDITABLE) !== null;

    // A form field keeps its own keys, except Escape and Up, which leave the box.
    if (editable && !(inBox && (event.key === 'Escape' || event.key === 'ArrowUp'))) {
      return;
    }

    // A menu owns its own keys while it is open, and a button or a link keeps
    // Enter, so the arrows start the list even after a chip took the focus.
    const control = event.target instanceof Element && event.target.closest(CONTROL) !== null;
    const menu = roleElement('scope-menu');

    if (menu !== null && !menu.hidden) {
      return;
    }

    // Up from the field leaves the box for the last alternative, and never the
    // list behind the box, because the reader is still typing there.
    if (inBox && editable && event.key === 'ArrowUp') {
      if (leaveBoxUp()) {
        event.preventDefault();
      }

      return;
    }

    // Escape leaves the search box for the list first, then leaves the page,
    // and it works before the rows arrive too, so the key cap on the button is
    // never a false promise.
    if (event.key === 'Escape') {
      const boxSelected = box !== null && box.dataset.selected === 'true';

      if ((inBox || boxSelected) && closeSearchBox()) {
        event.preventDefault();

        return;
      }

      if (control) {
        return;
      }

      if (selectedIndex !== null) {
        for (const stop of document.querySelectorAll<HTMLElement>(
          '[data-role="list"] > li, [data-role="search"], [data-role="fallback"]',
        )) {
          delete stop.dataset.selected;
        }

        selectedIndex = null;
        event.preventDefault();

        return;
      }

      event.preventDefault();
      goBack();

      return;
    }

    const list = roleElement('list');

    if (list === null) {
      return;
    }

    const rows = [...list.children].filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement,
    );
    const links = rows.map((row) => row.querySelector<HTMLAnchorElement>('a'));

    // A search card closes the list. When its box opens, the card leaves the
    // page and the box takes its place as the last stop, so the arrows always
    // lead back to the box after the focus left it, as a return from the
    // engine's own tab does.
    const search = roleElement('search');
    const lastStop =
      search !== null && !search.hidden ? search : box !== null && !box.hidden ? box : null;
    const stops: HTMLElement[] = lastStop === null ? rows : [...rows, lastStop];

    if (stops.length === 0 || links.some((link) => link === null)) {
      return;
    }

    if (selectedIndex !== null && stops[selectedIndex]?.dataset.selected !== 'true') {
      selectedIndex = null;
    }

    const select = (index: number): void => {
      for (const stop of stops) {
        delete stop.dataset.selected;
      }

      selectedIndex = index;
      stops[index]?.setAttribute('data-selected', 'true');
      stops[index]?.scrollIntoView?.({ block: 'nearest' });
    };

    const open = (index: number): void => {
      const stop = stops[index];

      if (stop === undefined) {
        return;
      }

      stopCountdown?.();

      // The last stop is not a result. The search card opens the box in place,
      // and the open box gives the focus to its first engine, where the digits
      // pick another. Both clear the marker, so the ring does not stay behind
      // the open box.
      if (index === rows.length) {
        delete stop.dataset.selected;
        selectedIndex = null;

        if (stop === search) {
          stop.click();
        } else {
          selectEngine(0);
        }

        return;
      }

      const link = links[index];

      if (link === null || link === undefined) {
        return;
      }

      navigate(link.href);
    };

    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;

      // The box in focus answers its digits with its engines, so the block
      // picks an engine and not a row behind it.
      if (box !== null && lastStop === box && selectedIndex === rows.length) {
        event.preventDefault();
        delete lastStop.dataset.selected;
        selectedIndex = null;

        if (index < SEARCH_ENGINES.length) {
          selectEngine(index);
        }

        return;
      }

      if (index < stops.length) {
        event.preventDefault();
        select(index);
        open(index);
      }

      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const last = stops.length - 1;
      const index =
        selectedIndex === null
          ? step === 1
            ? 0
            : last
          : Math.min(Math.max(selectedIndex + step, 0), last);

      event.preventDefault();
      select(index);

      return;
    }

    if (event.key === 'Enter' && !control) {
      event.preventDefault();
      open(selectedIndex ?? 0);
    }
  };

  document.addEventListener('keydown', keyboardShortcut);
}

/**
 * The page paints the URL and the frame first, then one answer fills it. The
 * worker owns the list, the settings, the scope, the metadata, and the answer,
 * so the page reads no storage and asks one question.
 */
export async function startBlockPage(options: BlockPageOptions): Promise<void> {
  // A foreign document must not frame the page and aim it at a publisher.
  if (window.top !== window.self) {
    return;
  }

  stopBlockPage();

  const run = pageRun;
  const send = options.send ?? defaultSend;
  const original = originalUrl(options.search);
  const navigate = options.navigate ?? ((url: string): void => location.assign(url));
  const goBack =
    options.goBack ??
    ((): void => {
      // The article is the entry before the block page, and going back to it
      // would stop again. The entry before the article is the reader's page.
      if (window.history.length > 2) {
        window.history.go(-2);
      } else {
        window.history.back();
      }
    });

  applyTheme(themeFrom(options.search));
  renderExplanation(original);
  installKeyboardNavigation(navigate, goBack);

  if (original === null) {
    setHidden('alternatives', true);
    renderNotice(null);

    return;
  }

  const retry = roleElement('retry');
  let loading = false;

  /** The note starts before the request, so a slow worker still says it is working. */
  const startNote = (siteName: string | null, listed: boolean): void => {
    if (!isWebUrl(original)) {
      return;
    }

    clearNote = startSlowNote({ siteName, url: original, navigate, listed });
  };

  /** The best match opens by itself only when the reader asked for it. */
  const autoOpen = (state: PageState, view: PageView): void => {
    stopCountdown?.();
    const best = view.kind === 'results' ? view.routes[0] : undefined;

    stopCountdown =
      state.settings.autoOpenBest && best !== undefined
        ? startCountdown({ url: best.url, domain: best.domain, navigate })
        : null;
  };

  const render = (state: PageState): void => {
    if (run !== pageRun) {
      return;
    }

    const view = state.view;

    applyTheme(state.settings.theme);
    renderThemeToggle(state.settings);

    if (view.kind === 'no-url' || view.kind === 'unavailable') {
      setHidden('alternatives', true);
      setHidden('actions', true);
      renderSourceCard(null, original, false);
      renderNotice(original);

      return;
    }

    setHidden('notice', true);
    renderListEntry(view.site, original);
    renderActions({
      original,
      siteName: view.site?.name ?? null,
      host: view.site?.domain ?? hostOf(original),
      listed: view.site !== null,
      listId: view.report.listId,
      defaultScope: view.scope,
      navigate,
      back: goBack,
    });
    renderSourceCard(view.meta, original, state.settings.imagesEnabled);
    renderAlternatives({
      state: view.kind,
      routes: view.kind === 'results' ? view.routes : [],
      imagesEnabled: state.settings.imagesEnabled,
      query: view.query,
      topic: view.kind === 'results' ? view.topic : null,
      searchDetail: SEARCH_CARD_DETAIL,
    });
    autoOpen(state, view);
  };

  const ask = async (): Promise<void> => {
    loading = true;

    const state = await requestPageState(send, original);

    if (run !== pageRun) {
      return;
    }

    loading = false;
    clearNote?.();
    clearNote = null;

    if (state === null) {
      setHidden('alternatives', true);
      setHidden('actions', true);
      renderSourceCard(null, original, false);
      renderNotice(original);

      return;
    }

    render(state);
  };

  if (retry instanceof HTMLButtonElement) {
    retry.onclick = (): void => {
      if (run !== pageRun || loading) {
        return;
      }

      retry.disabled = true;
      renderAlternatives({
        state: 'loading',
        routes: [],
        imagesEnabled: false,
        query: '',
        topic: null,
        searchDetail: SEARCH_CARD_DETAIL,
      });
      startNote(null, true);
      void ask().finally(() => {
        if (run === pageRun) {
          retry.disabled = false;
        }
      });
    };
  }

  // The note starts before the state, so it cannot know whether the list carries
  // the page: the tab allowance is the record that always lets the page open.
  startNote(null, true);

  await ask();
}
