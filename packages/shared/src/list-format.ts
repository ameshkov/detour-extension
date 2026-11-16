import { z } from 'zod';

import { DomainEntrySchema, SiteEntrySchema, SiteListSchema } from './list-schema';

interface FieldRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly notes: string;
}

const GENERATED_NOTE =
  'Generated from the schema. Do not edit by hand. Run pnpm docs:generate after a schema change.';

const PATH_GLOB_RULES = [
  'An empty `paths` list matches every path.',
  '`*` matches zero or more characters except `/`.',
  '`**` matches zero or more characters including `/`.',
  'Every other character is literal.',
  'A glob matches the whole path.',
  'The path is the URL pathname, with no query and no fragment.',
  'The comparison is case sensitive.',
  'A glob starts with `/` and holds no whitespace, `?`, or `#`.',
];

const VALIDATION_RULES = [
  'A site domain is unique across the list.',
  'A domain carries no `www.` prefix, scheme, path, or port.',
  'A site domain is absent from the global `avoid` and `prefer` lists.',
  'The evidence file exists, holds at least 200 characters, and carries a `- Checked: <YYYY-MM-DD>` line that equals `verified`.',
  '`updated` is not before any `verified` date.',
];

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function typeOfDescriptor(field: Record<string, unknown>): string {
  const values = field.enum;

  if (Array.isArray(values)) {
    return values.map((value) => String(value)).join(' | ');
  }

  if (field.type === 'array') {
    return `array of ${typeOfDescriptor(recordOf(field.items))}`;
  }

  return typeof field.type === 'string' ? field.type : 'unknown';
}

function rowsOf(schema: unknown): FieldRow[] {
  const root = recordOf(schema);
  const properties = recordOf(root.properties);
  const required = Array.isArray(root.required) ? root.required.map(String) : [];

  return Object.entries(properties).map(([name, property]) => {
    const field = recordOf(property);
    const description = field.description;

    return {
      name,
      type: typeOfDescriptor(field),
      required: required.includes(name),
      notes: typeof description === 'string' ? description : '—',
    };
  });
}

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|');
}

function renderTable(rows: readonly FieldRow[]): string {
  const header = '| Field | Type | Required | Notes |';
  const divider = '| --- | --- | --- | --- |';
  const body = rows.map(
    (row) =>
      `| ${row.name} | ${escapeCell(row.type)} | ${row.required ? 'yes' : 'no'} | ${escapeCell(row.notes)} |`,
  );

  return [header, divider, ...body].join('\n');
}

function renderBullets(rules: readonly string[]): string {
  return rules.map((rule) => `- ${rule}`).join('\n');
}

function renderSection(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

export function renderListFormat(): string {
  const options = { target: 'draft-2020-12', io: 'input' } as const;

  return [
    '# Site list format',
    GENERATED_NOTE,
    renderSection('Top level', renderTable(rowsOf(z.toJSONSchema(SiteListSchema, options)))),
    renderSection('Site entry', renderTable(rowsOf(z.toJSONSchema(SiteEntrySchema, options)))),
    renderSection('Domain entry', renderTable(rowsOf(z.toJSONSchema(DomainEntrySchema, options)))),
    renderSection('Path globs', renderBullets(PATH_GLOB_RULES)),
    renderSection('Validation', renderBullets(VALIDATION_RULES)),
  ].join('\n\n');
}
