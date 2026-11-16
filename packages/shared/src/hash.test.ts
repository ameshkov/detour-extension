import { describe, expect, it } from 'vitest';

import { sha256Hex } from './hash';

describe('the sha-256 digest', () => {
  it('answers the known lowercase hex digest', async () => {
    await expect(sha256Hex('a')).resolves.toBe(
      'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    );
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('answers one digest for one value', async () => {
    await expect(sha256Hex('https://example.com/a')).resolves.toBe(
      await sha256Hex('https://example.com/a'),
    );
  });
});
