import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { renderListFormat } from '@detour/shared/list-format';

const target = 'docs/list-format.md';

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${renderListFormat()}\n`, 'utf8');
process.stdout.write(`wrote ${target}\n`);
