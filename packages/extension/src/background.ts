import { LIST_REFRESH_ALARM, LIST_REFRESH_PERIOD_MINUTES } from './constants';
import { devLog } from './log';
import type { FetchLike } from './net';
import type { ServiceWorkerDeps } from './service-worker';
import { handleMessage, pruneCapability, pruneTabAllowances, refreshList } from './service-worker';

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

  // Chrome may drop an alarm when it restarts, so both the install and the
  // startup register it again before they ask for a fresh list.
  const scheduleRefresh = (): void => {
    chrome.alarms.create(LIST_REFRESH_ALARM, { periodInMinutes: LIST_REFRESH_PERIOD_MINUTES });
  };

  chrome.runtime.onInstalled.addListener(() => {
    scheduleRefresh();
    refresh();
  });

  chrome.runtime.onStartup.addListener(() => {
    scheduleRefresh();
    refresh();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LIST_REFRESH_ALARM) {
      refresh();
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void pruneTabAllowances(tabId);
    void pruneCapability(tabId);
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
