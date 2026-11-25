import { LIST_REFRESH_ALARM, LIST_REFRESH_PERIOD_MINUTES, STORAGE } from './constants';
import { devLog } from './log';
import type { FetchLike } from './net';
import type { ServiceWorkerDeps } from './service-worker';
import {
  handleMessage,
  pruneCapability,
  prunePass,
  pruneTabAllowances,
  refreshList,
  refreshToolbar,
} from './service-worker';

export type BackgroundOptions = {
  apiBase: string;
  now?: () => number;
  fetchImpl?: FetchLike;
};

/**
 * Binds the service worker to the browser events it owns: the periodic list
 * refresh, the closed tab, and the message contract. Every handler reads its
 * state from storage, so a worker that Chrome stops and starts again answers the
 * same way.
 */
export function registerBackground(options: BackgroundOptions): void {
  const deps: ServiceWorkerDeps = {
    apiBase: options.apiBase,
    now: options.now ?? (() => Date.now()),
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
  };

  const refresh = (): void => {
    void refreshList(deps);
  };

  const paintToolbar = (): void => {
    void refreshToolbar(deps.now);
  };

  // The badge answers for the page in front of the reader, so every event that
  // changes that page repaints it: a new tab, a navigation, and a window that
  // takes the focus. The settings, the pause, and the list repaint it too.
  const TOOLBAR_KEYS: Readonly<Record<string, readonly string[]>> = {
    local: [STORAGE.list, STORAGE.settings, STORAGE.pauseUntil],
    session: [STORAGE.pauseSession],
  };

  // Chrome may drop an alarm when it restarts, so both the install and the
  // startup register it again before they ask for a fresh list.
  const scheduleRefresh = (): void => {
    chrome.alarms.create(LIST_REFRESH_ALARM, { periodInMinutes: LIST_REFRESH_PERIOD_MINUTES });
  };

  chrome.runtime.onInstalled.addListener(() => {
    scheduleRefresh();
    refresh();
    paintToolbar();
  });

  chrome.runtime.onStartup.addListener(() => {
    scheduleRefresh();
    refresh();
    paintToolbar();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LIST_REFRESH_ALARM) {
      refresh();
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    paintToolbar();
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
      paintToolbar();
    }
  });

  chrome.windows.onFocusChanged.addListener(() => {
    paintToolbar();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((TOOLBAR_KEYS[areaName] ?? []).some((key) => key in changes)) {
      paintToolbar();
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void pruneTabAllowances(tabId);
    void pruneCapability(tabId);
    void prunePass(tabId);
  });

  // A true answer keeps the channel open for the asynchronous reply.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender, deps).then(sendResponse);

    return true;
  });

  devLog('background', 'the service worker is registered');
}

// The bundle defines API_BASE; a test document that defines chrome without the
// define still imports this module, and the typeof test keeps that import safe.
if (typeof chrome !== 'undefined' && typeof API_BASE !== 'undefined') {
  registerBackground({ apiBase: API_BASE });
}
