import { hasCapability } from './capabilities';
import { findSite } from './list-matching';
import type { MessageResponse, PassMessage } from './messages';
import { recordPass } from './passes';
import { readList } from './storage';

/** The sender's own tab, and never a tab id that the message claims. */
type TabSender = { tab?: { id?: number } };

/**
 * Writes one pass for the sender's tab and the URL it was stopped on. The pass
 * opens that URL once and writes no allowance, so the page is not allowlisted.
 * Only the tab that the guard stopped on this URL may ask, as with an
 * allowance, so a page that merely opened the block page gets nothing.
 */
export async function handlePass(
  message: PassMessage,
  sender: TabSender,
): Promise<MessageResponse> {
  const tabId = sender.tab?.id;

  if (tabId === undefined) {
    return { ok: false, error: 'missing_tab' };
  }

  if (!(await hasCapability(tabId, message.url))) {
    return { ok: false, error: 'bad_message' };
  }

  if (findSite(await readList(), message.url) === null) {
    return { ok: false, error: 'bad_message' };
  }

  await recordPass(tabId, message.url);

  return { ok: true };
}
