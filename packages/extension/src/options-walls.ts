import type { WallCategory, WallType } from '@detour/shared';

import { MESSAGE } from './constants';
import {
  COLUMN_WHY,
  METERED_NOTE,
  NO_WALL_NOTE,
  WALL_CATEGORY_DETAIL,
  WALL_CATEGORY_LABEL,
  WALL_TYPE_LABEL,
  WALLS_HEADING,
  WALLS_INTRO,
  wallCellLabel,
} from './copy';
import { roleElement, setText } from './dom';
import { createPageSender } from './page-send';
import type { Settings } from './storage';
import { WALL_CATEGORIES, WALL_TYPES, isWallCellPossible, setWallCell } from './walls';

/** What the walls table reads and writes: the settings and the reload behind them. */
export type WallsView = {
  settings: Settings;
  reload: () => void;
};

const sender = createPageSender('options');

/**
 * The cell that the reader pressed, so the re-render after a write returns the
 * focus to it. The table is built from the store, so without this the keyboard
 * would lose its place on every tick.
 */
let focusedCell: string | null = null;

/**
 * One cell of the walls table. The visible control holds no text, so its
 * accessible name names the type and the category, and a press writes the whole
 * settings record the way the reading rows do.
 */
function wallCell(category: WallCategory, type: WallType, view: WallsView): HTMLTableCellElement {
  const cell = document.createElement('td');

  cell.dataset.role = 'wall-cell';

  if (!isWallCellPossible(type, category)) {
    cell.dataset.empty = 'true';
    cell.setAttribute('aria-hidden', 'true');

    return cell;
  }

  const label = document.createElement('label');
  const input = document.createElement('input');

  input.type = 'checkbox';
  input.dataset.role = 'wall-check';
  input.checked = view.settings.walls[type].includes(category);
  input.setAttribute('aria-label', wallCellLabel(category, type));
  input.onchange = (): void => {
    const walls = setWallCell(view.settings.walls, type, category, input.checked);
    const settings: Settings = { ...view.settings, walls };

    focusedCell = input.getAttribute('aria-label');
    sender.send({ type: MESSAGE.setSettings, settings }, view.reload);
  };

  label.append(input);
  cell.append(label);

  return cell;
}

/** One category per row, the three types in the columns that follow it. */
function wallRow(category: WallCategory, view: WallsView): HTMLTableRowElement {
  const row = document.createElement('tr');
  const head = document.createElement('th');
  const name = document.createElement('span');
  const detail = document.createElement('span');

  head.scope = 'row';
  name.dataset.role = 'wall-name';
  name.textContent = WALL_CATEGORY_LABEL[category];
  detail.dataset.role = 'wall-detail';
  detail.textContent = WALL_CATEGORY_DETAIL[category];
  head.append(name, detail);
  row.append(head, ...WALL_TYPES.map((type) => wallCell(category, type, view)));

  return row;
}

/**
 * The settings table. A page stops when one of its walls sits in a ticked cell,
 * so the reader chooses a type and then the categories that type covers.
 */
export function renderWalls(view: WallsView): void {
  setText('walls-heading', WALLS_HEADING);
  setText('walls-intro', WALLS_INTRO);
  setText('th-why', COLUMN_WHY);
  setText('th-hard', WALL_TYPE_LABEL.hard);
  setText('th-soft', WALL_TYPE_LABEL.soft);
  setText('th-metered', WALL_TYPE_LABEL.metered);
  setText('metered-note', METERED_NOTE);
  setText('no-wall-note', NO_WALL_NOTE);

  const rows = roleElement('wall-rows');

  if (rows !== null) {
    rows.replaceChildren(...WALL_CATEGORIES.map((category) => wallRow(category, view)));
  }

  const returned =
    focusedCell === null ? null : document.querySelector(`[aria-label="${focusedCell}"]`);

  focusedCell = null;

  if (returned instanceof HTMLInputElement) {
    returned.focus();
  }
}
