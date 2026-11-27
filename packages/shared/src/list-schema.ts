import { z } from 'zod';

export const WallTypeSchema = z
  .enum(['hard', 'soft', 'metered'])
  .describe(
    'How the wall presents. hard replaces the article, soft covers it, and metered limits the number of articles.',
  );

export type WallType = z.infer<typeof WallTypeSchema>;

export const WallCategorySchema = z
  .enum(['adblock', 'paywall', 'registration', 'consent', 'region', 'vpn', 'age'])
  .describe(
    "Why the wall appears. adblock asks the reader to disable the ad blocker, paywall asks for a subscription, registration asks for an account, consent blocks the content until the reader accepts cookies or tracking, region refuses the reader's country, vpn refuses a VPN or proxy address, and age asks the reader to verify their age.",
  );

export type WallCategory = z.infer<typeof WallCategorySchema>;

export const WallSchema = z
  .object({
    category: WallCategorySchema,
    type: WallTypeSchema,
  })
  .describe('One wall that a reader meets, with its category and its type.');

export type Wall = z.infer<typeof WallSchema>;

const DOMAIN_PATTERN =
  /^(?!www\.)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PATH_GLOB_PATTERN = /^\/[^\s?#]*$/;

const DOMAIN_MESSAGE =
  'a domain is lowercase, has at least two labels, and carries no www. prefix, scheme, path, or port';
const PATH_GLOB_MESSAGE = 'a path glob starts with / and holds no whitespace, ?, or #';

export const DomainEntrySchema = z
  .object({
    domain: z
      .string()
      .regex(DOMAIN_PATTERN, DOMAIN_MESSAGE)
      .describe('The domain that the ranking uses.'),
  })
  .describe('A domain that the ranking considers.');

export type DomainEntry = z.infer<typeof DomainEntrySchema>;

/**
 * One publisher of the artifact that a backend serves.
 *
 * The artifact drops the editorial field `evidence`, and the extension does not
 * read the alternatives: a backend answers those. It keeps the fields that
 * decide a stop and render the block page, including the checked date when the
 * artifact carries it.
 */
export const ListedSiteSchema = z
  .object({
    domain: z
      .string()
      .regex(DOMAIN_PATTERN, DOMAIN_MESSAGE)
      .describe('The registrable domain of the publisher.'),
    name: z.string().min(1).describe('The publisher name, as the block page shows it.'),
    verified: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'a checked date is YYYY-MM-DD')
      .optional()
      .describe('The calendar date of the hand check, when the artifact carries it.'),
    walls: z
      .array(WallSchema)
      .min(1, 'must name at least one wall')
      .describe('Every wall that a reader meets here, with one entry per category.'),
    paths: z
      .array(z.string().regex(PATH_GLOB_PATTERN, PATH_GLOB_MESSAGE))
      .default([])
      .describe('Path globs. An empty list covers the whole site.'),
    note: z
      .string()
      .min(1)
      .max(200)
      .describe('One sentence on the wall, from 1 to 200 characters.'),
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
  .describe('One listed publisher, without the editorial fields.');

export type ListedSite = z.infer<typeof ListedSiteSchema>;

/** The list as a backend serves it at `GET /v1/list`. */
export const SitesJsonSchema = z
  .object({
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
    sites: z.array(ListedSiteSchema).describe('The listed publishers.'),
  })
  .describe('The list as the extension and a backend consume it.')
  .superRefine((list, ctx) => {
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

      const seenCategories = new Set<string>();

      site.walls.forEach((wall, position) => {
        if (seenCategories.has(wall.category)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sites', index, 'walls', position, 'category'],
            message: `duplicate wall category ${wall.category}`,
          });
        }

        seenCategories.add(wall.category);

        if (wall.type === 'metered' && wall.category !== 'paywall') {
          ctx.addIssue({
            code: 'custom',
            path: ['sites', index, 'walls', position, 'category'],
            message: 'a metered wall has the paywall category',
          });
        }
      });
    });
  });

export type SitesJson = z.infer<typeof SitesJsonSchema>;

/** The local overlay: entries that a development build adds to the release list. */
export const SitesJsonDevSchema = z
  .object({
    sites: z.array(ListedSiteSchema).min(1).describe('The entries that the overlay adds.'),
  })
  .describe('The local overlay, in the shape of the served list.');

export type SitesJsonDev = z.infer<typeof SitesJsonDevSchema>;
