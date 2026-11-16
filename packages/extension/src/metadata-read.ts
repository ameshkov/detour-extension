import type { PageMeta } from './metadata';
import type { ScannedTag } from './metadata-scan';
import { metaKey, scanTags } from './metadata-scan';

const ENTITY = /&(?:amp|quot|#39|#x27|lt|gt|nbsp);/g;

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': '\u00a0',
};

/** Decodes the common entities; an unknown entity stays as written. */
function decodeEntities(value: string): string {
  return value.replace(ENTITY, (entity) => ENTITIES[entity] ?? entity);
}

type MetaTags = {
  socialTitle: string | null;
  socialDescription: string | null;
  plainDescription: string | null;
};

function readMetaTags(tags: readonly ScannedTag[]): MetaTags {
  const found: MetaTags = {
    socialTitle: null,
    socialDescription: null,
    plainDescription: null,
  };

  for (const tag of tags) {
    if (tag.name !== 'meta') {
      continue;
    }

    const entry = metaKey(tag.text);

    if (entry === null) {
      continue;
    }

    if (entry.key === 'og:title') {
      found.socialTitle ??= entry.content;
    } else if (entry.key === 'og:description') {
      found.socialDescription ??= entry.content;
    } else if (entry.key === 'description') {
      found.plainDescription ??= entry.content;
    }
  }

  return found;
}

/** A title collapses its whitespace to one space; an empty value is null. */
function readTitle(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const collapsed = decodeEntities(value).replace(/\s+/g, ' ').trim();

  return collapsed === '' ? null : collapsed;
}

function readText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const decoded = decodeEntities(value).trim();

  return decoded === '' ? null : decoded;
}

/**
 * Reads the fields the block page shows from a page's head. It runs without a DOM,
 * because a service worker has none, and every missing or unusable value is null.
 */
export function readPageMeta(html: string): PageMeta {
  const tags = scanTags(html);
  const meta = readMetaTags(tags);
  const titleTag = tags.find((tag) => tag.name === 'title')?.content ?? null;

  return {
    title: readTitle(meta.socialTitle) ?? readTitle(titleTag),
    description: readText(meta.socialDescription) ?? readText(meta.plainDescription),
  };
}
