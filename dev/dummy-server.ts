import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SitesJson } from '@detour/shared';
import { SitesJsonSchema, buildQuery, findListedSite } from '@detour/shared';

/**
 * The local stand-in for the backend. It serves the same three endpoints as a
 * production server, and it serves the fixture article pages on the same
 * origin, so one process covers the whole local loop.
 */
export const DUMMY_ORIGIN = 'http://127.0.0.1:8787';
export const DUMMY_PORT = 8787;
export const DUMMY_SIGNING_KEY = 'local-development-only-key';

const MAX_JSON_BYTES = 65536;
const IMAGE_MAX_BYTES = 524288;
const IMAGE_FETCH_TIMEOUT_MS = 2500;
const SIGNATURE_LENGTH = 16;
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const PNG = 'image/png';

const IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

// Two 1x1 images, so an answer carries a real image link and the signed proxy
// reads real bytes.
const PREVIEW_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQz+8HAAHOAR7AQOwLAAAAAElFTkSuQmCC',
  'base64',
);
const SOURCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO46S0HAANDAUPLzETSAAAAAElFTkSuQmCC',
  'base64',
);

const WALLED_TITLE = "Nvidia's next move: custom silicon for its biggest customers";
const EMPTY_TITLE = 'A local story with no alternatives';
const NORMAL_TITLE = 'The fixture article that is not walled';
const REDIRECT_TITLE = 'The fixture article that refreshes to the unlisted host';

export const DUMMY_PROVIDER = 'dummy';

/** The four saved results that a non-empty answer carries. */
export const DUMMY_RESULTS: ReadonlyArray<{
  url: string;
  title: string;
  description: string;
  domain: string;
}> = [
  {
    url: 'https://www.niemanlab.org/2026/09/the-ad-block-wall-is-now-the-default/',
    title: 'The ad-block wall is now the default',
    description:
      'Publishers are trading a smaller advertising audience for subscription conversions.',
    domain: 'niemanlab.org',
  },
  {
    url: 'https://www.poynter.org/business-work/2026/why-publishers-keep-asking-you-to-turn-off-your-ad-blocker/',
    title: 'Why publishers keep asking you to turn off your ad blocker',
    description: 'Detection scripts have become the first thing a reader meets on a news site.',
    domain: 'poynter.org',
  },
  {
    url: 'https://digiday.com/media/publishers-ad-block-walls-2026/',
    title: 'Publishers are betting ad-block walls convert better than paywalls',
    description:
      'A polite request reaches more readers than a hard stop, according to several media executives.',
    domain: 'digiday.com',
  },
  {
    url: 'https://pressgazette.co.uk/media-audience-and-business-data/ad-blocking-walls-2026/',
    title: 'Ad blocking is falling, but the walls are staying',
    description:
      'Newer browsers ship stricter tracking protection, yet publishers say the share of blocked readers has barely moved.',
    domain: 'pressgazette.co.uk',
  },
];

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type DummyServerOptions = {
  /** The fixture pages and images use this origin in every link they build. */
  origin?: string;
  port?: number;
  host?: string;
  list?: SitesJson;
  signingKey?: string;
  fetchImpl?: FetchLike;
};

export type DummyServer = {
  server: Server;
  origin: string;
  close: () => Promise<void>;
};

type Ctx = {
  origin: string;
  list: SitesJson;
  signingKey: string;
  fetchImpl: FetchLike;
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_TYPE, ...headers },
  });
}

function errorBody(status: number, code: string): Response {
  return json({ error: code }, status, { 'Cache-Control': 'no-store' });
}

function apiHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);

  // The dummy server answers every local caller. A production server restricts
  // this origin; local work has no reason to refuse one.
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Expose-Headers', 'ETag');

  return headers;
}

function withApiHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: apiHeaders(response),
  });
}

function signImagePath(url: string, key: string): string {
  return createHmac('sha256', key).update(url).digest('hex').slice(0, SIGNATURE_LENGTH);
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function imageType(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim().toLowerCase();
}

function imageUrl(origin: string, sourceUrl: string, key: string): string {
  const query = new URLSearchParams({
    u: sourceUrl,
    sig: signImagePath(sourceUrl, key),
  }).toString();

  return `${origin}/v1/img?${query}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseAlternativesBody(value: unknown): { url: string; title: string } | null {
  const record = asRecord(value);

  if (record === null) {
    return null;
  }

  const url = record.url;
  const title = record.title;
  const lang = record.lang;

  if (typeof url !== 'string' || !isWebUrl(url)) {
    return null;
  }

  if (title !== undefined && typeof title !== 'string') {
    return null;
  }

  if (lang !== undefined && typeof lang !== 'string') {
    return null;
  }

  return { url, title: typeof title === 'string' ? title : '' };
}

function answerFor(input: { url: string; title: string }, ctx: Ctx): Response {
  const site = findListedSite(ctx.list, input.url);
  const query = buildQuery({ title: input.title, url: input.url, siteName: site?.name ?? '' });
  const wantsEmpty =
    new URL(input.url).pathname.endsWith('/empty-state') ||
    input.title.toLowerCase().includes('no alternatives');

  if (wantsEmpty) {
    return json({ query, degraded: false, provider: DUMMY_PROVIDER, alternatives: [] });
  }

  const alternatives = DUMMY_RESULTS.map((row, index) => {
    const alternative: Record<string, string> = {
      url: row.url,
      title: row.title,
      description: row.description,
      domain: row.domain,
    };

    // The first row carries a signed image, so the block page and the image
    // proxy get one real request in a local run.
    if (index === 0) {
      alternative.image = imageUrl(ctx.origin, `${ctx.origin}/images/preview.png`, ctx.signingKey);
    }

    return alternative;
  });

  return json({ query, degraded: false, provider: DUMMY_PROVIDER, alternatives });
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);

    total += bytes.byteLength;

    if (total > MAX_JSON_BYTES) {
      throw new Error('too_large');
    }

    chunks.push(bytes);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveImage(request: IncomingMessage, ctx: Ctx): Promise<Response> {
  if (request.method !== 'GET') {
    return errorBody(405, 'method_not_allowed');
  }

  const params = new URL(request.url ?? '/', ctx.origin).searchParams;
  const source = params.get('u');
  const sig = params.get('sig');

  if (source === null) {
    return errorBody(400, 'bad_request');
  }

  if (sig === null || signImagePath(source, ctx.signingKey) !== sig) {
    return errorBody(403, 'forbidden');
  }

  if (!isWebUrl(source)) {
    return errorBody(403, 'forbidden');
  }

  let upstream: Response;

  try {
    upstream = await ctx.fetchImpl(source, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch {
    return errorBody(502, 'fetch_failed');
  }

  if (!upstream.ok) {
    return errorBody(502, 'fetch_failed');
  }

  const contentType = upstream.headers.get('content-type') ?? '';

  if (!IMAGE_TYPES.has(imageType(contentType))) {
    return errorBody(415, 'not_an_image');
  }

  const declared = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);

  if (Number.isInteger(declared) && declared > IMAGE_MAX_BYTES) {
    return errorBody(413, 'too_large');
  }

  let body: ArrayBuffer;

  try {
    body = await upstream.arrayBuffer();
  } catch {
    return errorBody(502, 'fetch_failed');
  }

  if (body.byteLength > IMAGE_MAX_BYTES) {
    return errorBody(413, 'too_large');
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function document(head: readonly string[], body: readonly string[]): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    ...head.map((line) => `    ${line}`),
    '  </head>',
    '  <body>',
    ...body.map((line) => `    ${line}`),
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function html(head: readonly string[], body: readonly string[]): Response {
  return new Response(document(head, body), {
    status: 200,
    headers: { 'Content-Type': HTML, 'Cache-Control': 'no-store' },
  });
}

function walledPage(origin: string): Response {
  return html(
    [
      `<title>${WALLED_TITLE}</title>`,
      `<meta property="og:title" content="${WALLED_TITLE}" />`,
      `<meta property="og:description" content="A local fixture article about custom silicon and the customers that ask for it." />`,
      `<meta property="og:image" content="${origin}/images/source.png" />`,
      `<link rel="canonical" href="${origin}/walled/nvidia-custom-silicon" />`,
    ],
    [
      `<h1>${WALLED_TITLE}</h1>`,
      '<p>This fixture page stands in for an article that a publisher walls to readers who block ads.</p>',
      '<p>The body renders here, behind the wall that the extension stops.</p>',
    ],
  );
}

function emptyPage(): Response {
  return html(
    [`<title>${EMPTY_TITLE}</title>`, `<meta property="og:title" content="${EMPTY_TITLE}" />`],
    [
      `<h1>${EMPTY_TITLE}</h1>`,
      '<p>This fixture article answers a search with no alternative at all.</p>',
    ],
  );
}

function normalPage(): Response {
  return html(
    [`<title>${NORMAL_TITLE}</title>`],
    [
      `<h1>${NORMAL_TITLE}</h1>`,
      '<p>This fixture article sits outside the listed glob, so the extension lets it load.</p>',
    ],
  );
}

function redirectPage(origin: string): Response {
  return html(
    [
      `<title>${REDIRECT_TITLE}</title>`,
      `<meta http-equiv="refresh" content="2;url=http://forbes.test:${new URL(origin).port}/open/article">`,
    ],
    [
      `<h1>${REDIRECT_TITLE}</h1>`,
      '<p>This document asks the browser for the unlisted host after two seconds.</p>',
    ],
  );
}

function resultPage(pathname: string): Response {
  const title = `The fixture result page for ${pathname}`;

  return html(
    [`<title>${title}</title>`],
    [`<h1>${title}</h1>`, '<p>This fixture page answers a search result and carries no wall.</p>'],
  );
}

function landingPage(): Response {
  return html(
    ['<title>Detour dummy server</title>'],
    [
      '<h1>Detour dummy server</h1>',
      '<p>This local server answers the backend contract and the fixture pages.</p>',
      '<ul>',
      '  <li><code>GET /v1/list</code></li>',
      '  <li><code>POST /v1/alternatives</code></li>',
      '  <li><code>GET /v1/img</code></li>',
      '  <li><code>GET /walled/nvidia-custom-silicon</code></li>',
      '</ul>',
    ],
  );
}

function privacyPage(): Response {
  return html(
    ['<title>Detour privacy (local)</title>'],
    [
      '<h1>Detour privacy (local)</h1>',
      '<p>This is the local dummy server. It stores no data and sends none.</p>',
    ],
  );
}

function pageFor(pathname: string, origin: string): Response | null {
  switch (pathname) {
    case '/':
      return landingPage();
    case '/privacy':
      return privacyPage();
    case '/walled/nvidia-custom-silicon':
      return walledPage(origin);
    case '/walled/empty-state':
      return emptyPage();
    case '/open/article':
      return normalPage();
    case '/walled/redirect-to-open':
      return redirectPage(origin);
    case '/images/preview.png':
      return new Response(PREVIEW_PNG, { headers: { 'Content-Type': PNG } });
    case '/images/source.png':
      return new Response(SOURCE_PNG, { headers: { 'Content-Type': PNG } });
    case '/v1/img':
      return null;
    default:
      return pathname.startsWith('/v1/') ? null : resultPage(pathname);
  }
}

async function route(request: IncomingMessage, ctx: Ctx): Promise<Response | null> {
  const { pathname } = new URL(request.url ?? '/', ctx.origin);

  if (request.method === 'OPTIONS' && isApiPath(pathname)) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (pathname === '/v1/list') {
    if (request.method !== 'GET') {
      return errorBody(405, 'method_not_allowed');
    }

    const tag = `"v${ctx.list.version}"`;
    const headers = { ETag: tag, 'Cache-Control': 'public, max-age=1800' };

    if (request.headers['if-none-match'] === tag) {
      return new Response(null, { status: 304, headers });
    }

    return json(ctx.list, 200, headers);
  }

  if (pathname === '/v1/alternatives') {
    if (request.method !== 'POST') {
      return errorBody(405, 'method_not_allowed');
    }

    let body: unknown;

    try {
      body = await readBody(request);
    } catch {
      return errorBody(400, 'bad_request');
    }

    const parsed = parseAlternativesBody(body);

    return parsed === null ? errorBody(400, 'bad_request') : answerFor(parsed, ctx);
  }

  if (pathname === '/v1/img') {
    return serveImage(request, ctx);
  }

  return pageFor(pathname, ctx.origin);
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/v1/');
}

function respond(request: IncomingMessage, response: ServerResponse, ctx: Ctx): void {
  const send = (result: Response): void => {
    response.writeHead(result.status, Object.fromEntries(result.headers));

    if (result.status === 204 || result.status === 304) {
      response.end();
      return;
    }

    void result
      .arrayBuffer()
      .then((body) => response.end(Buffer.from(body)))
      .catch(() => {
        response.destroy();
      });
  };

  const pathname = new URL(request.url ?? '/', ctx.origin).pathname;
  const api = isApiPath(pathname);

  void route(request, ctx)
    .then((result) => {
      const answer = result ?? errorBody(404, 'not_found');

      send(api ? withApiHeaders(answer) : answer);
    })
    .catch(() => {
      const failed = errorBody(500, 'internal_error');

      send(api ? withApiHeaders(failed) : failed);
    });
}

/** Reads the generated list that `pnpm list:build` writes. */
export function readBundledList(root = resolve(import.meta.dirname, '..')): SitesJson {
  const path = resolve(root, 'packages', 'extension', 'src', 'sites.json');

  try {
    return SitesJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    throw new Error(`${path}: the list is missing or invalid; run pnpm list:build`);
  }
}

export async function startDummyServer(options: DummyServerOptions = {}): Promise<DummyServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? DUMMY_PORT;
  const list = options.list ?? readBundledList();
  const signingKey = options.signingKey ?? DUMMY_SIGNING_KEY;
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));

  // The handler needs the real origin for the links of its pages. A request
  // that carries the Host header supplies it, and the configured origin is the
  // fallback for a direct call.
  let origin = options.origin ?? (port === 0 ? 'http://127.0.0.1' : `http://${host}:${port}`);

  const server = createServer((request, response) => {
    respond(request, response, { origin, list, signingKey, fetchImpl });
  });

  await new Promise<void>((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => {
      server.off('error', rejectServer);
      resolveServer();
    });
  });

  const address = server.address();

  if (address !== null && typeof address === 'object') {
    origin = `http://${host}:${address.port}`;
  }

  return {
    server,
    origin,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
      }),
  };
}

async function main(): Promise<void> {
  const portIndex = process.argv.indexOf('--port');
  const portValue = portIndex === -1 ? undefined : process.argv[portIndex + 1];
  const port = portValue === undefined ? DUMMY_PORT : Number.parseInt(portValue, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write('usage: pnpm dummy-server [--port <number>]\n');
    process.exit(1);
  }

  try {
    const server = await startDummyServer({ port });

    process.stdout.write(`the dummy server listens on ${server.origin}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const entry = process.argv[1];

if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
