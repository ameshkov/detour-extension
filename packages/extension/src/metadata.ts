export type PageMeta = {
  title: string | null;
  description: string | null;
  /** The absolute link of the page icon, or null when the head names none. */
  icon: string | null;
};

/**
 * The one guard of the shape: a stored entry and a message answer use it. An
 * entry stored by an earlier release may carry extra fields, and it may lack the
 * icon, and both are accepted rather than invalidating the entry.
 */
export function isPageMeta(value: unknown): value is PageMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const icon = record.icon;

  return (
    (record.title === null || typeof record.title === 'string') &&
    (record.description === null || typeof record.description === 'string') &&
    (icon === undefined || icon === null || typeof icon === 'string')
  );
}
