import { addAllowance, pruneAllowance, removeAllowance } from './allowances';
import { hasCapability } from './capabilities';
import { findSite } from './list-matching';
import type { AllowMessage, MessageResponse, RevokeMessage } from './messages';
import type { ServiceWorkerDeps } from './service-worker';
import { readAllowance, readAllowances, readList, writeAllowance } from './storage';

/** The sender's own tab, and never a tab id that the message claims. */
type TabSender = { tab?: { id?: number } };

/**
 * Adds one allowance. The allowance stores the matched list entry's domain, so a
 * subdomain of an allowed site is covered by the same entry, and a URL the list
 * does not carry writes nothing. The caller must be the tab that the guard
 * stopped on this URL, and a tab allowance belongs to that sender's tab.
 */
export async function handleAllow(
  message: AllowMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<MessageResponse> {
  const senderTabId = sender.tab?.id;

  if (!(await hasCapability(senderTabId, message.url))) {
    return { ok: false, error: 'bad_message' };
  }

  const site = findSite(await readList(), message.url);

  if (site === null) {
    return { ok: false, error: 'bad_message' };
  }

  const tabId = message.scope === 'tab' ? senderTabId : undefined;

  if (message.scope === 'tab' && tabId === undefined) {
    return { ok: false, error: 'missing_tab' };
  }

  const entries = await readAllowance(message.scope);

  await writeAllowance(message.scope, addAllowance(entries, site.domain, tabId, deps.now()));

  return { ok: true, allowances: await readAllowances() };
}

/**
 * Removes one allowance by the host it names. A removal needs no list match, so a
 * site that has left the list can still be cleared, and a tab entry is removed
 * from its own tab only.
 */
export async function handleRevoke(message: RevokeMessage): Promise<MessageResponse> {
  const entries = await readAllowance(message.scope);
  const next = removeAllowance(entries, message.host, message.tabId);

  await writeAllowance(message.scope, next);

  return { ok: true, allowances: await readAllowances() };
}

/** A closed tab loses its tab allowance; a session and a permanent entry stay. */
export async function pruneTabAllowances(tabId: number): Promise<void> {
  const entries = await readAllowance('tab');
  const next = pruneAllowance(entries, tabId);

  if (next.length === entries.length) {
    return;
  }

  await writeAllowance('tab', next);
}
