/**
 * The lowercase hexadecimal SHA-256 digest of a value. The extension keys its
 * caches by it and a backend keys an article and a fixture by it, so one
 * implementation keeps every key identical.
 */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
