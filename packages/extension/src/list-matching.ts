/**
 * The first list entry whose domain covers the URL's host and whose path globs
 * cover its path. The shared matcher answers null for a value that does not
 * parse as an http(s) URL and for a site that the list does not name.
 */
export { findListedSite as findSite } from '@detour/shared';
