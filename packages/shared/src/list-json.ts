import { z } from 'zod';

import type { SiteList } from './list-schema';
import { SiteEntrySchema, SiteListSchema } from './list-schema';

const SitesJsonSiteSchema = z
  .object({
    domain: SiteEntrySchema.shape.domain,
    name: SiteEntrySchema.shape.name,
    wall: SiteEntrySchema.shape.wall,
    paths: SiteEntrySchema.shape.paths,
    note: SiteEntrySchema.shape.note,
    avoid: SiteEntrySchema.shape.avoid,
    prefer: SiteEntrySchema.shape.prefer,
  })
  .describe('One listed publisher, without the editorial fields.');

export const SitesJsonSchema = z
  .object({
    version: SiteListSchema.shape.version,
    updated: SiteListSchema.shape.updated,
    disabled: SiteListSchema.shape.disabled,
    avoid: SiteListSchema.shape.avoid,
    prefer: SiteListSchema.shape.prefer,
    sites: z.array(SitesJsonSiteSchema).describe('The listed publishers.'),
  })
  .describe('The list as the extension and a backend consume it.');

export type SitesJson = z.infer<typeof SitesJsonSchema>;

export function toSitesJson(list: SiteList): SitesJson {
  return SitesJsonSchema.parse({
    version: list.version,
    updated: list.updated,
    disabled: list.disabled,
    avoid: list.avoid,
    prefer: list.prefer,
    sites: list.sites.map((site) => ({
      domain: site.domain,
      name: site.name,
      wall: site.wall,
      paths: site.paths,
      note: site.note,
      avoid: site.avoid,
      prefer: site.prefer,
    })),
  });
}
