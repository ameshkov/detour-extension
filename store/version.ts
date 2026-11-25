const VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;

/** The numbers of a manifest version, or null when the store would refuse it. */
export function parseVersion(value: string): number[] | null {
  if (!VERSION.test(value)) {
    return null;
  }

  return value.split('.').map(Number);
}

function padded(version: readonly number[]): number[] {
  return [0, 1, 2, 3].map((index) => version[index] ?? 0);
}

/** -1, 0, or 1, as a comparison of the store's own version order. */
export function compareVersions(left: string, right: string): number {
  const one = parseVersion(left);
  const two = parseVersion(right);

  if (one === null || two === null) {
    throw new Error(`"${one === null ? left : right}" is not a version`);
  }

  const first = padded(one);
  const second = padded(two);

  for (let index = 0; index < 4; index += 1) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0);

    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

/**
 * Why the store would refuse this upload, or null when the version is new. The
 * store compares the manifest version with the one that it already published,
 * so the run stops before a request that cannot succeed.
 */
export function versionProblem(published: string | null, local: string): string | null {
  if (published === null) {
    return null;
  }

  if (parseVersion(local) === null) {
    return `the manifest says "${local}", which is not a version`;
  }

  if (parseVersion(published) === null) {
    return `the store reports version "${published}", which the run cannot compare`;
  }

  if (compareVersions(local, published) <= 0) {
    return `the manifest says ${local} and the store already has ${published}; increase the version before a release`;
  }

  return null;
}
