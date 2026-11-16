import { z } from 'zod';

export const WallTypeSchema = z
  .enum(['hard', 'soft', 'metered'])
  .describe(
    'The kind of wall. hard replaces the article, soft covers it, and metered limits the number of articles.',
  );

export type WallType = z.infer<typeof WallTypeSchema>;

const DOMAIN_PATTERN =
  /^(?!www\.)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PATH_GLOB_PATTERN = /^\/[^\s?#]*$/;
const EVIDENCE_PATTERN = /^sites\/evidence\/[a-z0-9.-]+\.md$/;

const DOMAIN_MESSAGE =
  'a domain is lowercase, has at least two labels, and carries no www. prefix, scheme, path, or port';
const PATH_GLOB_MESSAGE = 'a path glob starts with / and holds no whitespace, ?, or #';
const EVIDENCE_MESSAGE = 'an evidence path is a file under sites/evidence/ that ends with .md';

export const DomainEntrySchema = z
  .object({
    domain: z
      .string()
      .regex(DOMAIN_PATTERN, DOMAIN_MESSAGE)
      .describe('The domain that the ranking uses.'),
  })
  .describe('A domain that the ranking considers.');

export type DomainEntry = z.infer<typeof DomainEntrySchema>;

export const SiteEntrySchema = z
  .object({
    domain: z
      .string()
      .regex(DOMAIN_PATTERN, DOMAIN_MESSAGE)
      .describe('The registrable domain of the publisher.'),
    name: z.string().min(1).describe('The publisher name, as the block page shows it.'),
    wall: WallTypeSchema,
    paths: z
      .array(z.string().regex(PATH_GLOB_PATTERN, PATH_GLOB_MESSAGE))
      .default([])
      .describe('Path globs. An empty list covers the whole site.'),
    note: z
      .string()
      .min(1)
      .max(200)
      .describe('One sentence on the wall, from 1 to 200 characters.'),
    verified: z.iso.date().describe('The calendar date of the hand check.'),
    evidence: z
      .string()
      .regex(EVIDENCE_PATTERN, EVIDENCE_MESSAGE)
      .describe('The evidence document under sites/evidence/, ending with .md.'),
    avoid: z
      .array(DomainEntrySchema)
      .default([])
      .describe('Domains removed from results for this site, merged with the global avoid list.'),
    prefer: z
      .array(DomainEntrySchema)
      .default([])
      .describe(
        'Domains that score 2 for this site in the ranking; a global prefer domain scores 1.',
      ),
  })
  .describe('One listed publisher.');

export type SiteEntry = z.infer<typeof SiteEntrySchema>;

export const SiteDevListSchema = z
  .object({
    sites: z
      .array(SiteEntrySchema)
      .min(1)
      .describe('The entries that a development build adds to the release list.'),
  })
  .describe('The local overlay: entries that never reach the release list.');

export type SiteDevList = z.infer<typeof SiteDevListSchema>;

export const SiteListSchema = z
  .object({
    version: z
      .number()
      .int()
      .min(1)
      .describe('The list version, an integer of 1 or more that increments on every list change.'),
    updated: z.iso
      .date()
      .describe('The calendar date of the last change. It is not before any verified date.'),
    disabled: z
      .boolean()
      .default(false)
      .describe('Stops blocking for every reader without an extension release.'),
    avoid: z
      .array(DomainEntrySchema)
      .default([])
      .describe('Domains removed from results for every source.'),
    prefer: z
      .array(DomainEntrySchema)
      .default([])
      .describe('Domains that score 1 for every source in the ranking.'),
    sites: z.array(SiteEntrySchema).min(1).describe('The listed publishers, at least one.'),
  })
  .describe('The site list: the editorial data that the extension and a backend read.')
  .superRefine((list, ctx) => {
    const globalDomains = new Set([...list.avoid, ...list.prefer].map((entry) => entry.domain));
    const seenDomains = new Set<string>();

    list.sites.forEach((site, index) => {
      if (seenDomains.has(site.domain)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sites', index, 'domain'],
          message: `duplicate site domain ${site.domain}`,
        });
      }

      seenDomains.add(site.domain);

      if (globalDomains.has(site.domain)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sites', index, 'domain'],
          message: `the site domain ${site.domain} is in the global avoid or prefer list`,
        });
      }

      if (site.verified > list.updated) {
        ctx.addIssue({
          code: 'custom',
          path: ['updated'],
          message: `the updated date ${list.updated} is before the verified date ${site.verified} of ${site.domain}`,
        });
      }
    });
  });

export type SiteList = z.infer<typeof SiteListSchema>;

export class ListValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`invalid site list:\n${issues.join('\n')}`);
    this.name = 'ListValidationError';
    this.issues = issues;
  }
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map((part) => String(part)).join('.');

  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

export function parseSiteList(input: unknown): SiteList {
  const result = SiteListSchema.safeParse(input);

  if (!result.success) {
    throw new ListValidationError(result.error.issues.map(formatIssue));
  }

  return result.data;
}
