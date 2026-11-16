import { parse } from 'yaml';

import type { SiteDevList, SiteList, SitesJson } from '@detour/shared';
import { ListValidationError, SiteDevListSchema, parseSiteList, toSitesJson } from '@detour/shared';

import { checkEvidence } from './evidence';

export type BuildResult =
  { ok: true; list: SiteList; json: SitesJson } | { ok: false; problems: string[] };

type ListResult = { ok: true; list: SiteList } | { ok: false; problems: string[] };

type DevListResult = { ok: true; list: SiteDevList } | { ok: false; problems: string[] };

const DEV_FILE = 'sites.dev.yaml';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseList(input: unknown): ListResult {
  try {
    return { ok: true, list: parseSiteList(input) };
  } catch (error) {
    if (error instanceof ListValidationError) {
      return { ok: false, problems: error.issues };
    }

    throw error;
  }
}

function parseDevList(text: string): DevListResult {
  let input: unknown;

  try {
    input = parse(text);
  } catch (error) {
    return { ok: false, problems: [`${DEV_FILE}: ${messageOf(error)}`] };
  }

  const result = SiteDevListSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((issue) => {
        const path = issue.path.map((part) => String(part)).join('.');
        const message = path === '' ? issue.message : `${path}: ${issue.message}`;

        return `${DEV_FILE}: ${message}`;
      }),
    };
  }

  return { ok: true, list: result.data };
}

function mergeDevList(base: SiteList, dev: SiteDevList): unknown {
  const dates = [base.updated, ...dev.sites.map((site) => site.verified)];
  const updated = dates.reduce((latest, date) => (date > latest ? date : latest));

  return {
    version: base.version,
    updated,
    disabled: base.disabled,
    avoid: base.avoid,
    prefer: base.prefer,
    sites: [...base.sites, ...dev.sites],
  };
}

export function buildSitesJson(
  yamlText: string,
  readEvidence: (path: string) => string | null,
  devYamlText?: string,
): BuildResult {
  let input: unknown;

  try {
    input = parse(yamlText);
  } catch (error) {
    return { ok: false, problems: [`sites.yaml: ${messageOf(error)}`] };
  }

  const base = parseList(input);

  if (!base.ok) {
    return { ok: false, problems: base.problems };
  }

  let list = base.list;

  if (devYamlText !== undefined) {
    const dev = parseDevList(devYamlText);

    if (!dev.ok) {
      return { ok: false, problems: dev.problems };
    }

    const merged = parseList(mergeDevList(base.list, dev.list));

    if (!merged.ok) {
      return { ok: false, problems: merged.problems };
    }

    list = merged.list;
  }

  const problems = list.sites.flatMap((entry) =>
    checkEvidence(entry, readEvidence(entry.evidence)).map(
      (problem) => `${entry.evidence}: ${problem}`,
    ),
  );

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, list, json: toSitesJson(list) };
}
