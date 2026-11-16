export type AllowanceScope = 'tab' | 'session' | 'always';

/**
 * One allowance. Only a tab entry carries `tabId`, because only a tab entry
 * lives until its tab closes.
 */
export type AllowanceEntry = {
  host: string;
  addedAt: number;
  tabId?: number;
};

export type AllowanceState = {
  allowAlways: AllowanceEntry[];
  allowSession: AllowanceEntry[];
  allowTabs: AllowanceEntry[];
};

/**
 * An allowance stores the matched list entry's domain, so a visit to a subdomain
 * asks about the same host. The test is exact, and the caller resolves the
 * domain before it asks.
 */
export function allowsHost(entries: readonly AllowanceEntry[], host: string): boolean {
  return entries.some((entry) => entry.host === host);
}

/**
 * A tab entry covers the tab that holds it and a tab opened from that tab.
 */
export function allowsTab(
  entries: readonly AllowanceEntry[],
  host: string,
  tabId: number,
  openerTabId?: number,
): boolean {
  return entries.some(
    (entry) =>
      entry.host === host &&
      (entry.tabId === tabId || (openerTabId !== undefined && entry.tabId === openerTabId)),
  );
}

export function addAllowance(
  entries: readonly AllowanceEntry[],
  host: string,
  tabId: number | undefined,
  now: number,
): AllowanceEntry[] {
  const entry: AllowanceEntry =
    tabId === undefined ? { host, addedAt: now } : { host, tabId, addedAt: now };

  return [...removeAllowance(entries, host, tabId), entry];
}

export function removeAllowance(
  entries: readonly AllowanceEntry[],
  host: string,
  tabId: number | undefined,
): AllowanceEntry[] {
  return entries.filter((entry) => !(entry.host === host && entry.tabId === tabId));
}

export function pruneAllowance(
  entries: readonly AllowanceEntry[],
  tabId: number,
): AllowanceEntry[] {
  return entries.filter((entry) => entry.tabId !== tabId);
}
