/**
 * A stand-in for the parts of `chrome.*` that the extension uses. A test installs
 * it, drives the code under test, and reads the recorded calls.
 */

/**
 * A listener of any shape. The fake accepts it and calls it with the arguments
 * the test supplies, so the event needs no second generic.
 */
type FakeListener = (...args: never[]) => unknown;

export const FAKE_EXTENSION_ID = 'jcncblagncbpbamfnekhdkomffdpehpk';

type StorageGetKeys = string | readonly string[] | Record<string, unknown> | null;

export class FakeStorageArea {
  readonly values: Record<string, unknown> = {};
  failReads = false;
  failWrites = false;

  async get(keys?: StorageGetKeys): Promise<Record<string, unknown>> {
    if (this.failReads) {
      throw new Error('the fake storage read failed');
    }

    if (keys === undefined || keys === null) {
      return { ...this.values };
    }

    if (typeof keys === 'string') {
      return keys in this.values ? { [keys]: this.values[keys] } : {};
    }

    const result: Record<string, unknown> = {};

    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (key in this.values) {
          result[key] = this.values[key];
        }
      }

      return result;
    }

    for (const [key, fallback] of Object.entries(keys)) {
      result[key] = key in this.values ? this.values[key] : fallback;
    }

    return result;
  }

  async set(values: Record<string, unknown>): Promise<void> {
    if (this.failWrites) {
      throw new Error('the fake storage write failed');
    }

    Object.assign(this.values, values);
  }

  async remove(keys: string | readonly string[]): Promise<void> {
    if (this.failWrites) {
      throw new Error('the fake storage write failed');
    }

    for (const key of typeof keys === 'string' ? [keys] : keys) {
      delete this.values[key];
    }
  }

  async clear(): Promise<void> {
    if (this.failWrites) {
      throw new Error('the fake storage write failed');
    }

    for (const key of Object.keys(this.values)) {
      delete this.values[key];
    }
  }
}

export class FakeEvent {
  readonly listeners: FakeListener[] = [];

  addListener(listener: FakeListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: FakeListener): void {
    const index = this.listeners.indexOf(listener);

    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  hasListener(listener: FakeListener): boolean {
    return this.listeners.includes(listener);
  }

  /**
   * The listeners keep their own shapes, so the fake calls them through the
   * broadest one with the arguments of the test.
   */
  trigger(...args: unknown[]): void {
    for (const listener of [...this.listeners]) {
      (listener as (...listenerArgs: unknown[]) => unknown)(...args);
    }
  }
}

function messageType(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  ) {
    return value.type;
  }

  return '';
}

export class FakeChrome {
  /** The id of the tab a block page or a popup calls its own. */
  currentTabId = 11;

  /** The page the active tab holds: the bundled list's CNET article. */
  activeTabUrl = 'https://www.cnet.com/tech/services-and-software/best-ai-image-generators/';

  /** The page each other tab holds, read by a worker that re-checks a tab. */
  readonly tabPages = new Map<number, string>();

  /** The version the extension reports for a prefilled issue. */
  extensionVersion = '0.1.0';

  readonly storage = {
    local: new FakeStorageArea(),
    session: new FakeStorageArea(),
    onChanged: new FakeEvent(),
  };

  /** The toolbar calls, recorded in the order that the code makes them. */
  readonly action = {
    setIcon: async (details: { path?: Record<number, string> }): Promise<void> => {
      this.calls.icons.push(details.path ?? {});
    },
    setBadgeText: async (details: { text: string }): Promise<void> => {
      this.calls.badges.push(details.text);
    },
    setBadgeBackgroundColor: async (details: { color: string }): Promise<void> => {
      this.calls.badgeColors.push(details.color);
    },
    setBadgeTextColor: async (details: { color: string }): Promise<void> => {
      this.calls.badgeTextColors.push(details.color);
    },
    setTitle: async (details: { title: string }): Promise<void> => {
      this.calls.titles.push(details.title);
    },
  };

  readonly runtime = {
    getManifest: (): { version: string } => ({ version: this.extensionVersion }),
    openOptionsPage: async (): Promise<void> => {
      this.calls.openedOptionsPage += 1;
    },
    sendMessage: async (message: unknown): Promise<unknown> => {
      this.calls.messages.push(message);

      const handler = this.responses.get(messageType(message));

      return handler === undefined ? undefined : await handler(message);
    },
    onMessage: new FakeEvent(),
    onInstalled: new FakeEvent(),
    onStartup: new FakeEvent(),
    getURL: (path: string): string =>
      `chrome-extension://${FAKE_EXTENSION_ID}/${path.replace(/^\/+/, '')}`,
  };

  readonly tabs = {
    update: async (
      tabId: number,
      props: { url?: string },
    ): Promise<{ id: number; url?: string }> => {
      this.calls.updates.push({ tabId, url: props.url });

      if (this.updateError !== null) {
        const error = this.updateError;
        this.updateError = null;

        throw error;
      }

      return { id: tabId, url: props.url };
    },
    create: async (props: { url?: string }): Promise<{ id: number; url?: string }> => {
      this.nextTabId += 1;

      return { id: this.nextTabId, url: props.url };
    },
    get: async (tabId: number): Promise<{ id: number; url?: string }> => {
      const known = this.tabPages.get(tabId);
      const url = known ?? (tabId === this.currentTabId ? this.activeTabUrl : undefined);

      return { id: tabId, url };
    },
    getCurrent: async (): Promise<{ id: number }> => ({ id: this.currentTabId }),
    query: async (): Promise<Array<{ id: number; url: string }>> => [
      { id: this.currentTabId, url: this.activeTabUrl },
    ],
    onActivated: new FakeEvent(),
    onRemoved: new FakeEvent(),
    onUpdated: new FakeEvent(),
  };

  readonly windows = {
    WINDOW_ID_NONE: -1,
    onFocusChanged: new FakeEvent(),
  };

  readonly alarms = {
    create: (name: string, info: { periodInMinutes?: number }): void => {
      this.calls.createdAlarms.push({ name, periodInMinutes: info.periodInMinutes });
    },
    onAlarm: new FakeEvent(),
  };

  readonly calls = {
    updates: [] as Array<{ tabId: number; url?: string }>,
    createdAlarms: [] as Array<{ name: string; periodInMinutes?: number }>,
    messages: [] as unknown[],
    openedOptionsPage: 0,
    icons: [] as Array<Record<number, string>>,
    badges: [] as string[],
    badgeColors: [] as string[],
    badgeTextColors: [] as string[],
    titles: [] as string[],
  };

  sender: { tab?: { id?: number; openerTabId?: number } } = {};

  private readonly responses = new Map<string, (message: unknown) => unknown>();
  private updateError: Error | null = null;
  private nextTabId = 0;

  /**
   * The answer of one message type. A type without a handler answers undefined,
   * as the browser does when no listener responds.
   */
  respond(type: string, handler: (message: unknown) => unknown): void {
    this.responses.set(type, handler);
  }

  failNextUpdate(error: Error = new Error('the fake tab update failed')): void {
    this.updateError = error;
  }
}

export function installFakeChrome(): FakeChrome {
  const fake = new FakeChrome();
  (globalThis as unknown as { chrome: FakeChrome }).chrome = fake;

  return fake;
}

export function resetFakeChrome(): void {
  Reflect.deleteProperty(globalThis, 'chrome');
}
