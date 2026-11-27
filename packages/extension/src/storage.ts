import type { SitesJson } from '@detour/shared';
import { SitesJsonSchema } from '@detour/shared';

import type { AllowanceEntry, AllowanceScope, AllowanceState } from './allowances';
import { DEFAULT_SETTINGS, LIST_STORAGE_VERSION, STORAGE } from './constants';
import bundledList from './sites.json';
import { BUNDLED_LIST_ID } from './sites-id';
import type { WallSettings } from './walls';
import { defaultWalls, isWallSettings, readWallSettings } from './walls';
import type { ThemeChoice } from './theme';
import { isThemeChoice, readThemeChoice } from './theme';

export type Settings = {
  enabled: boolean;
  autoOpenBest: boolean;
  imagesEnabled: boolean;
  /** The painted theme: follow the system, or hold one of the two. */
  theme: ThemeChoice;
  /** The walls that stop a page, grouped by the type that presents them. */
  walls: WallSettings;
};

/**
 * The stored list and the extension's own storage version, kept apart from the
 * content version of the list itself. The identifier is the SHA-256 of the body
 * that the list came from, so a report names the exact list that the reader used.
 */
export type StoredList = {
  storageVersion: number;
  fetchedAt: number;
  listId: string;
  list: SitesJson;
};

export const BUNDLED_LIST: SitesJson = SitesJsonSchema.parse(bundledList);

type StorageSlot = 'local' | 'session';

const ALLOWANCE_STORAGE: Record<AllowanceScope, StorageSlot> = {
  always: 'local',
  session: 'session',
  tab: 'session',
};

const ALLOWANCE_KEY: Record<AllowanceScope, string> = {
  always: STORAGE.allowAlways,
  session: STORAGE.allowSession,
  tab: STORAGE.allowTabs,
};

function area(slot: StorageSlot): chrome.storage.StorageArea {
  return slot === 'local' ? chrome.storage.local : chrome.storage.session;
}

/**
 * A value from the store, or undefined when the store is missing or fails. A read
 * failure costs one answer from the defaults, never a thrown error.
 */
async function readValue(slot: StorageSlot, key: string): Promise<unknown> {
  try {
    const values = await area(slot).get(key);

    return values[key];
  } catch {
    return undefined;
  }
}

async function writeValue(slot: StorageSlot, key: string, value: unknown): Promise<void> {
  await area(slot).set({ [key]: value });
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export async function readSettings(): Promise<Settings> {
  const stored = await readValue('local', STORAGE.settings);

  if (typeof stored !== 'object' || stored === null) {
    return { ...DEFAULT_SETTINGS, walls: defaultWalls() };
  }

  const record = stored as Record<string, unknown>;

  return {
    enabled: readBoolean(record.enabled, DEFAULT_SETTINGS.enabled),
    autoOpenBest: readBoolean(record.autoOpenBest, DEFAULT_SETTINGS.autoOpenBest),
    imagesEnabled: readBoolean(record.imagesEnabled, DEFAULT_SETTINGS.imagesEnabled),
    theme: readThemeChoice(record.theme),
    walls: readWallSettings(record.walls),
  };
}

export async function writeSettings(settings: Settings): Promise<void> {
  await writeValue('local', STORAGE.settings, {
    enabled: settings.enabled,
    autoOpenBest: settings.autoOpenBest,
    imagesEnabled: settings.imagesEnabled,
    theme: settings.theme,
    walls: settings.walls,
  });
}

/**
 * The one guard of the settings shape: a message and a state answer both use it.
 * `readSettings` does not, because a stored value falls back per field.
 */
export function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.enabled === 'boolean' &&
    typeof record.autoOpenBest === 'boolean' &&
    typeof record.imagesEnabled === 'boolean' &&
    isThemeChoice(record.theme) &&
    isWallSettings(record.walls)
  );
}

function isAllowanceEntry(value: unknown): value is AllowanceEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.host === 'string' &&
    typeof record.addedAt === 'number' &&
    (record.tabId === undefined || typeof record.tabId === 'number')
  );
}

function toAllowanceEntries(value: unknown): AllowanceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: unknown[] = value;

  return items.filter(isAllowanceEntry);
}

export async function readAllowance(scope: AllowanceScope): Promise<AllowanceEntry[]> {
  const stored = await readValue(ALLOWANCE_STORAGE[scope], ALLOWANCE_KEY[scope]);

  return toAllowanceEntries(stored);
}

export async function writeAllowance(
  scope: AllowanceScope,
  entries: readonly AllowanceEntry[],
): Promise<void> {
  await writeValue(ALLOWANCE_STORAGE[scope], ALLOWANCE_KEY[scope], [...entries]);
}

export async function readAllowances(): Promise<AllowanceState> {
  const [allowAlways, allowSession, allowTabs] = await Promise.all([
    readAllowance('always'),
    readAllowance('session'),
    readAllowance('tab'),
  ]);

  return { allowAlways, allowSession, allowTabs };
}

/**
 * The stored envelope, or null when the store is empty, carries another storage
 * version, or holds a list that the schema rejects. The identifier of an
 * accepted list is the SHA-256 of the body behind it, so a report names the
 * exact list in use.
 */
export async function readStoredList(): Promise<StoredList | null> {
  const stored = await readValue('local', STORAGE.list);

  if (typeof stored !== 'object' || stored === null) {
    return null;
  }

  const envelope = stored as Record<string, unknown>;

  if (
    envelope.storageVersion !== LIST_STORAGE_VERSION ||
    typeof envelope.fetchedAt !== 'number' ||
    typeof envelope.listId !== 'string'
  ) {
    return null;
  }

  const parsed = SitesJsonSchema.safeParse(envelope.list);

  return parsed.success
    ? {
        storageVersion: LIST_STORAGE_VERSION,
        fetchedAt: envelope.fetchedAt,
        listId: envelope.listId,
        list: parsed.data,
      }
    : null;
}

export async function writeStoredList(
  fetchedAt: number,
  list: SitesJson,
  listId: string,
): Promise<void> {
  const stored: StoredList = { storageVersion: LIST_STORAGE_VERSION, fetchedAt, listId, list };

  await writeValue('local', STORAGE.list, stored);
}

export async function readList(): Promise<SitesJson> {
  const stored = await readStoredList();

  return stored?.list ?? BUNDLED_LIST;
}

/** The identifier of the list in use, for a report or a message. */
export async function readListId(): Promise<string> {
  const stored = await readStoredList();

  return stored?.listId ?? BUNDLED_LIST_ID;
}
