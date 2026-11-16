import { describe, expect, it } from 'vitest';

import type { AllowanceEntry } from './allowances';
import { addAllowance, allowsHost, allowsTab, pruneAllowance, removeAllowance } from './allowances';

const permanent: AllowanceEntry[] = [{ host: 'forbes.com', addedAt: 1_000 }];
const session: AllowanceEntry[] = [{ host: 'cnn.com', addedAt: 2_000 }];

describe('allowances', () => {
  it('allows a host with a permanent entry', () => {
    expect(allowsHost(permanent, 'forbes.com')).toBe(true);
  });

  it('allows a host with a session entry', () => {
    expect(allowsHost(session, 'cnn.com')).toBe(true);
  });

  it('allows the tab that holds an entry', () => {
    const entries: AllowanceEntry[] = [{ host: 'forbes.com', tabId: 7, addedAt: 1_000 }];

    expect(allowsTab(entries, 'forbes.com', 7)).toBe(true);
  });

  it('allows a tab opened from an allowed tab', () => {
    const entries: AllowanceEntry[] = [{ host: 'forbes.com', tabId: 3, addedAt: 1_000 }];

    expect(allowsTab(entries, 'forbes.com', 9, 3)).toBe(true);
  });

  it('leaves a tab without an entry blocked', () => {
    const entries: AllowanceEntry[] = [{ host: 'forbes.com', tabId: 3, addedAt: 1_000 }];

    expect(allowsTab(entries, 'forbes.com', 9)).toBe(false);
  });

  it("does not let one host's entry cover another", () => {
    expect(allowsHost(permanent, 'cnn.com')).toBe(false);
  });

  it('adds an entry with its host and time', () => {
    expect(addAllowance([], 'forbes.com', 7, 1_000)).toEqual([
      { host: 'forbes.com', tabId: 7, addedAt: 1_000 },
    ]);
  });

  it('replaces the entry of the same tab and host', () => {
    const first = addAllowance([], 'forbes.com', 7, 1_000);
    const second = addAllowance(first, 'forbes.com', 7, 2_000);

    expect(second).toEqual([{ host: 'forbes.com', tabId: 7, addedAt: 2_000 }]);
  });

  it('removes only the matching entries', () => {
    const entries: AllowanceEntry[] = [
      { host: 'forbes.com', tabId: 7, addedAt: 1_000 },
      { host: 'cnn.com', tabId: 7, addedAt: 2_000 },
      { host: 'forbes.com', tabId: 8, addedAt: 3_000 },
    ];

    expect(removeAllowance(entries, 'forbes.com', 7)).toEqual([
      { host: 'cnn.com', tabId: 7, addedAt: 2_000 },
      { host: 'forbes.com', tabId: 8, addedAt: 3_000 },
    ]);
  });

  it('prunes the entries of a closed tab', () => {
    const entries: AllowanceEntry[] = [
      { host: 'forbes.com', tabId: 7, addedAt: 1_000 },
      { host: 'cnn.com', tabId: 8, addedAt: 2_000 },
    ];

    expect(pruneAllowance(entries, 7)).toEqual([{ host: 'cnn.com', tabId: 8, addedAt: 2_000 }]);
  });

  it("leaves another tab's entry alone", () => {
    const entries: AllowanceEntry[] = [{ host: 'forbes.com', tabId: 7, addedAt: 1_000 }];

    expect(addAllowance(entries, 'forbes.com', 8, 2_000)).toEqual([
      { host: 'forbes.com', tabId: 7, addedAt: 1_000 },
      { host: 'forbes.com', tabId: 8, addedAt: 2_000 },
    ]);
  });
});
