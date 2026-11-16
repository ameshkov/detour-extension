/**
 * The version of the running extension, or null when no runtime answers. An
 * invalidated context throws from `getManifest`, and each caller is a render
 * path: a version that cannot be read costs a link, never the page.
 */
export function currentVersion(): string | null {
  if (typeof chrome === 'undefined' || chrome.runtime === undefined) {
    return null;
  }

  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return null;
  }
}
