import { hasCapability } from './capabilities';
import { findSite } from './list-matching';
import type { MessageResponse, RememberScopeMessage } from './messages';
import { readScopeDefaults, rememberScope, writeScopeDefaults } from './scope-defaults';
import { readList } from './storage';

/** The sender's own tab, and never a tab id that the message claims. */
type TabSender = { tab?: { id?: number } };

/**
 * Stores the scope that the reader chose for the domain of the stopped page, so
 * the next block page of that domain starts on the same choice. The caller must
 * be the tab that the guard stopped on this URL, and a URL that the list does
 * not carry writes nothing.
 */
export async function handleRememberScope(
  message: RememberScopeMessage,
  sender: TabSender,
): Promise<MessageResponse> {
  if (!(await hasCapability(sender.tab?.id, message.url))) {
    return { ok: false, error: 'bad_message' };
  }

  const site = findSite(await readList(), message.url);

  if (site === null) {
    return { ok: false, error: 'bad_message' };
  }

  const defaults = await readScopeDefaults();

  await writeScopeDefaults(rememberScope(defaults, site.domain, message.scope));

  return { ok: true };
}
