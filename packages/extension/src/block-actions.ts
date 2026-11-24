import type { AllowanceScope } from './allowances';
import { REPORT_LABEL, SCOPE_LABEL, SCOPE_MENU_LABEL, openAnywayLabel } from './copy';
import { roleElement, setHidden, setText } from './dom';
import { openSite } from './open-site';
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
  navigate: (url: string) => void;
};

const MENU_ITEMS: ReadonlyArray<readonly [string, AllowanceScope]> = [
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

  delete menu.dataset.side;

  if (caret === null) {
    return;
  }

  const below = menu.getBoundingClientRect();
  const room = window.innerHeight - 8;
  const above = caret.getBoundingClientRect().top - below.height - 12;

  if (below.bottom > room && above > 8) {
    menu.dataset.side = 'top';
  }
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

  stopMenuListeners();
  setHidden('scope-menu', true);
  setHidden('actions', original === null);
  setHidden('action-error', true);
  setText('open-site', openAnywayLabel(view.siteName ?? view.host ?? ''));
  renderReport(view, roleElement('report'));

  if (caret !== null) {
    caret.setAttribute('aria-label', SCOPE_MENU_LABEL);
    caret.setAttribute('aria-haspopup', 'menu');
    caret.setAttribute('aria-expanded', 'false');
    caret.onclick = null;
    caret.onkeydown = null;
  }

  onClick('open-site', null);

  for (const [role, scope] of MENU_ITEMS) {
    setText(role, SCOPE_LABEL[scope]);
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

  const openWith = (scope: AllowanceScope): (() => void) => {
    return (): void => {
      setHidden('action-error', true);
      close(false);
      void openSite({ scope, url: original, navigate: view.navigate, listed: view.listed });
    };
  };

  onClick('open-site', openWith('tab'));

  for (const [role, scope] of MENU_ITEMS) {
    onClick(role, openWith(scope));
  }
}
