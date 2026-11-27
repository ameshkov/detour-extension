import {
  BACK_LABEL,
  ESC_KEY,
  ONCE_DETAIL,
  ONCE_LABEL,
  REPORT_LABEL,
  SCOPE_DETAIL,
  SCOPE_LABEL,
  SCOPE_MENU_LABEL,
  openAnywayLabel,
} from './copy';
import { roleElement, setHidden, setText } from './dom';
import type { OpenSiteKind } from './open-site';
import { openSite, rememberScopeChoice } from './open-site';
import { isWebUrl } from './page-url';
import { reportUrl } from './report';
import { currentVersion } from './version';

/**
 * The allowance send and the tab it grants live in `open-site.ts`, so the row
 * and the note share one path to the service worker. They keep their names here
 * for the callers that read them beside the row.
 */
export { openSite } from './open-site';
export type { OpenSiteInput } from './open-site';

export type ActionsView = {
  original: string | null;
  siteName: string | null;
  host: string | null;
  listed: boolean;
  listId: string;
  /** The choice that the reader kept for this domain, or `tab`. */
  defaultScope: OpenSiteKind;
  navigate: (url: string) => void;
  back: () => void;
};

function menuLabel(kind: OpenSiteKind): string {
  if (kind === 'once') {
    return ONCE_LABEL;
  }

  return SCOPE_LABEL[kind];
}

/** The sentence under a scope label, so the choice explains what it covers. */
function menuDetail(kind: OpenSiteKind): string {
  return kind === 'once' ? ONCE_DETAIL : SCOPE_DETAIL[kind];
}

/**
 * One menu item, as its label and its sentence. The button's accessible name
 * carries both, and the check that CSS adds follows the text.
 */
function renderMenuItem(role: string, kind: OpenSiteKind): void {
  const button = roleElement(role);

  if (button === null) {
    return;
  }

  const text = document.createElement('span');
  const label = document.createElement('span');
  const detail = document.createElement('span');

  text.className = 'scope-text';
  label.className = 'scope-label';
  detail.className = 'scope-detail';
  label.textContent = menuLabel(kind);
  detail.textContent = menuDetail(kind);
  text.append(label, detail);
  button.replaceChildren(text);
}

const MENU_ITEMS: ReadonlyArray<readonly [string, OpenSiteKind]> = [
  ['scope-once', 'once'],
  ['scope-tab', 'tab'],
  ['scope-session', 'session'],
  ['scope-always', 'always'],
];

/**
 * The two listeners of the open menu: Escape, and a press outside the control.
 * Both live on the document only while the menu is open, so a reader who moved
 * focus into a menu item still closes it, and a press anywhere else closes it
 * the way a menu of the browser does.
 */
let escapeListener: ((event: KeyboardEvent) => void) | null = null;
let outsideListener: ((event: PointerEvent) => void) | null = null;

function stopMenuListeners(): void {
  if (escapeListener !== null) {
    document.removeEventListener('keydown', escapeListener);
    escapeListener = null;
  }

  if (outsideListener !== null) {
    document.removeEventListener('pointerdown', outsideListener);
    outsideListener = null;
  }
}

function onClick(role: string, handler: (() => void) | null): void {
  const element = roleElement(role);

  if (element !== null) {
    element.onclick = handler;
  }
}

/** The quiet report link, prefilled when the build can name its version. */
function renderReport(view: ActionsView, link: HTMLElement | null): void {
  const version = currentVersion();

  if (!(link instanceof HTMLAnchorElement) || version === null) {
    setHidden('report', true);
    return;
  }

  link.textContent = REPORT_LABEL;
  link.hidden = false;
  link.setAttribute(
    'href',
    reportUrl({
      url: view.original,
      listId: view.listId,
      extensionVersion: version,
    }),
  );
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer noopener');
}

/**
 * A row that sits near the bottom of the viewport opens its menu upward, so the
 * scopes it offers are never hidden past the edge of the window. The menu drops
 * its side first, so the measurement is the one it would take below the row.
 */
function placeMenu(menu: HTMLElement | null, caret: HTMLElement | null): void {
  if (menu === null) {
    return;
  }

  menu.style.maxHeight = '';
  menu.style.overflowY = '';
  delete menu.dataset.side;

  if (caret === null) {
    return;
  }

  const below = menu.getBoundingClientRect();
  const room = window.innerHeight - 8;
  const caretRect = caret.getBoundingClientRect();
  const above = caretRect.top - below.height - 12;
  const top = below.bottom > room && above > 8;

  if (top) {
    menu.dataset.side = 'top';
  }

  // A menu of sentences is taller than a menu of labels, so it takes the room
  // on its side of the control and scrolls inside it. The reader never meets a
  // menu that starts above the window.
  const available = top ? caretRect.top - 12 : room - (caretRect.bottom + 6);

  menu.style.maxHeight = `${Math.max(140, available)}px`;
  menu.style.overflowY = 'auto';
}

/**
 * The action row: one outline button that opens the site in this tab, a caret
 * that offers the other two scopes, and the report link. The row belongs to the
 * page, not to the list: any web URL can be opened, and the matched host only
 * names it. The menu starts closed, and every control is reached through an
 * `onclick` assignment, so a second render replaces a handler instead of adding
 * one; a control of a hidden row keeps none.
 */
export function renderActions(view: ActionsView): void {
  const caret = roleElement('open-menu');
  const menu = roleElement('scope-menu');
  const original = view.original !== null && isWebUrl(view.original) ? view.original : null;
  let chosen = view.defaultScope;

  stopMenuListeners();
  setHidden('scope-menu', true);
  setHidden('open-group', original === null);
  setHidden('open-site', original === null);
  setHidden('actions', original === null);
  setHidden('note', original === null);
  setHidden('action-error', true);
  setText('back-label', BACK_LABEL);
  setText('back-key', ESC_KEY);
  setText('open-site-label', openAnywayLabel(view.siteName ?? view.host ?? ''));
  setText('open-menu-label', menuLabel(chosen));
  renderReport(view, roleElement('report'));
  onClick('back', view.back);

  if (caret !== null) {
    caret.setAttribute('aria-label', SCOPE_MENU_LABEL);
    caret.setAttribute('aria-haspopup', 'menu');
    caret.setAttribute('aria-expanded', 'false');
    caret.onclick = null;
    caret.onkeydown = null;
  }

  onClick('open-site', null);

  for (const [role, kind] of MENU_ITEMS) {
    renderMenuItem(role, kind);
    roleElement(role)?.setAttribute('aria-checked', String(kind === chosen));
    onClick(role, null);
  }

  if (original === null) {
    return;
  }

  const setOpen = (open: boolean): void => {
    if (menu !== null) {
      menu.hidden = !open;
    }

    caret?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const close = (focus = true): void => {
    setOpen(false);
    stopMenuListeners();

    if (focus) {
      caret?.focus();
    }
  };

  /**
   * A press on a scope only chooses it. The reader then opens the site with the
   * main button, so the menu never navigates on its own. The worker stores the
   * choice for the domain, so the next block page starts on it.
   */
  const choose = (kind: OpenSiteKind): void => {
    chosen = kind;
    setText('open-menu-label', menuLabel(kind));

    for (const [role, itemKind] of MENU_ITEMS) {
      roleElement(role)?.setAttribute('aria-checked', String(itemKind === kind));
    }

    close();

    if (original !== null) {
      rememberScopeChoice(original, kind);
    }
  };

  const open = (): void => {
    setOpen(true);
    placeMenu(menu, caret);
    stopMenuListeners();
    escapeListener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
      }
    };
    outsideListener = (event: PointerEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (menu?.contains(target) === true || caret?.contains(target) === true) {
        return;
      }

      // A press elsewhere closes the menu and leaves the focus where the reader
      // put it, so the other control of the page answers the press.
      close(false);
    };
    document.addEventListener('keydown', escapeListener);
    document.addEventListener('pointerdown', outsideListener);
  };

  if (caret !== null) {
    caret.onclick = (): void => {
      if (menu !== null && !menu.hidden) {
        close();
      } else {
        open();
      }
    };

    caret.onkeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
  }

  const openWith = (kind: OpenSiteKind): (() => void) => {
    return (): void => {
      setHidden('action-error', true);
      close(false);
      void openSite({ kind, url: original, navigate: view.navigate, listed: view.listed });
    };
  };

  onClick('open-site', (): void => {
    openWith(chosen)();
  });

  for (const [role, kind] of MENU_ITEMS) {
    onClick(role, (): void => choose(kind));
  }
}
