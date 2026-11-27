/**
 * The one place a sender is read: its tab, the tab that opened it, its page, and
 * the frame it was sent from. Every handler uses these, so the gate on a message
 * is written once.
 */
export type TabSender = {
  tab?: { id?: number; openerTabId?: number };
  url?: string;
  frameId?: number;
};

/**
 * The popup, the block page, and the options page are the only anonymous callers
 * of the contract. A content script always carries its page as the sender, so a
 * page cannot ask the worker to answer for a tab it does not own.
 */
export function fromExtensionPage(sender: TabSender): boolean {
  try {
    return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
  } catch {
    return false;
  }
}

/** `block.html` is a web accessible resource, so a framed copy must answer nothing. */
export function isTopFrame(sender: TabSender): boolean {
  return sender.frameId === 0;
}
