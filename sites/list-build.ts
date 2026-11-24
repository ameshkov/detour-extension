import { SitesJsonDevSchema, SitesJsonSchema } from '@detour/shared';
import type { SitesJson } from '@detour/shared';
import { parse } from 'yaml';

export type BuildResult = { ok: true; list: SitesJson } | { ok: false; problems: string[] };

type OverlayResult = { ok: true; sites: SitesJson['sites'] } | { ok: false; problems: string[] };

type Issue = { path: readonly PropertyKey[]; message: string };

function problemsOf(issues: readonly Issue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join('.');

    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
}

function parseRelease(input: unknown): BuildResult {
  const result = SitesJsonSchema.safeParse(input);

  return result.success
    ? { ok: true, list: result.data }
    : { ok: false, problems: problemsOf(result.error.issues) };
}

function parseOverlay(text: string): OverlayResult {
  let input: unknown;

  try {
    input = parse(text);
  } catch (error) {
    return { ok: false, problems: [`sites.dev.yaml: ${String(error)}`] };
  }

  const result = SitesJsonDevSchema.safeParse(input);

  return result.success
    ? { ok: true, sites: result.data.sites }
    : {
        ok: false,
        problems: problemsOf(result.error.issues).map((problem) => `sites.dev.yaml: ${problem}`),
      };
}

/**
 * The release artifact, with the local overlay appended when a development
 * build asks for it. The merged list must pass the same schema, so a duplicate
 * domain across the two files fails the build.
 */
export function buildList(release: unknown, overlayText?: string): BuildResult {
  const base = parseRelease(release);

  if (!base.ok || overlayText === undefined) {
    return base;
  }

  const overlay = parseOverlay(overlayText);

  if (!overlay.ok) {
    return { ok: false, problems: overlay.problems };
  }

  return parseRelease({ ...base.list, sites: [...base.list.sites, ...overlay.sites] });
}
