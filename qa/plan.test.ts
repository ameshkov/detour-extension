import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The plan says which behaviours the product promises and who checks each one.
 * A scenario without a tag, or without a step, is a plan that nobody can run, so
 * the shape is checked here rather than by eye.
 */
const FEATURES = resolve(import.meta.dirname, 'features');

const TAGS = new Set(['@unit', '@e2e', '@manual', '@visual']);

type Scenario = { name: string; tags: string[]; steps: string[]; line: number };

type Feature = { file: string; scenarios: Scenario[] };

function features(): Feature[] {
  return readdirSync(FEATURES)
    .filter((name) => name.endsWith('.feature'))
    .sort()
    .map((name) => {
      const lines = readFileSync(join(FEATURES, name), 'utf8').split('\n');
      const scenarios: Scenario[] = [];
      let tags: string[] = [];
      let current: Scenario | null = null;

      for (const [index, raw] of lines.entries()) {
        const line = raw.trim();

        if (line.startsWith('@')) {
          tags = line.split(/\s+/).filter((word) => word.startsWith('@'));
          continue;
        }

        const scenario = /^Scenario(?: Outline)?: (.+)$/.exec(line);

        if (scenario !== null) {
          current = { name: scenario[1] ?? '', tags, steps: [], line: index + 1 };
          scenarios.push(current);
          tags = [];
          continue;
        }

        if (current !== null && /^(Given|When|Then|And|But) /.test(line)) {
          current.steps.push(line);
        }
      }

      return { file: name, scenarios };
    });
}

function problems(): string[] {
  const found: string[] = [];

  for (const feature of features()) {
    if (feature.scenarios.length === 0) {
      found.push(`${feature.file}: no scenario`);
    }

    for (const scenario of feature.scenarios) {
      const where = `${feature.file}:${scenario.line}`;

      if (scenario.tags.length === 0) {
        found.push(`${where}: "${scenario.name}" carries no tag`);
      }

      for (const tag of scenario.tags) {
        if (!TAGS.has(tag)) {
          found.push(`${where}: "${scenario.name}" carries the unknown tag ${tag}`);
        }
      }

      if (!scenario.tags.some((tag) => tag !== '@visual')) {
        found.push(`${where}: "${scenario.name}" names no one who checks it`);
      }

      if (scenario.steps.length === 0) {
        found.push(`${where}: "${scenario.name}" carries no step`);
      }
    }
  }

  return found;
}

describe('the Gherkin plan', () => {
  it('gives every scenario a tag, a checker, and a step', () => {
    expect(problems()).toEqual([]);
  });
});
