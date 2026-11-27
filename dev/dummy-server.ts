import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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

/**
 * The wait of the `/walled/slow` fixture. The block page shows its loading state
 * at once and its slow note after three seconds, so five seconds make both
 * visible without reaching the fifteen-second deadline of a real search.
 */
export const DUMMY_SLOW_DELAY_MS = 5000;

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

// A small gradient for the result preview and a flat colour for the source
// page, so an answer carries a real image link and the signed proxy reads real
// bytes. One pixel would stretch to a flat block in a screenshot.
const PREVIEW_PNG = Buffer.from(
  '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',
  'base64',
);

const SOURCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO46S0HAANDAUPLzETSAAAAAElFTkSuQmCC',
  'base64',
);

/**
 * One 16 px favicon for each saved result, so every answer carries a favicon
 * link that the signed image route serves like any other image. The shapes tell
 * the four apart in a local run.
 */
const FAVICON_PNGS: Readonly<Record<string, Buffer>> = {
  'niemanlab.org': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AZRPK2uCURh+PWlusDAYY0HjQAZjYbCwsl8gKBaDXTCISRFERRBNYhDsBoso+AssBsEggihGDSKCQfCS/PQ5cOSc83n7Djy8l+fCeRkdn9M9TDncI8MK4DlaiaExyJbEYAXwwMvQWDHKWnj5CfJS9H9fjxTyvXD8uOxibaqmgCc7o2LknaoZB0UDrxz1nJPvwOkJpoBs8I08/8+6ju/A6YQSgK+eMwsTOJwmZlQl4Pfz8q0QA98fDygnKAGnrYVGCeiNdzetncFW0SgB7f6GGq2VIpAHcN3hlQCI4+X52RCYwUEjQ/kBiPV2T+HCjLyxCeUrCw5/Ysp34KCRYQoQJL5aqi0JwGlir1dmIyOtL++d4WWTpiuF5l6T0MED7wEAAP//iOzDHAAAAAZJREFUAwAvCHS/UK2XUQAAAABJRU5ErkJggg==',
    'base64',
  ),
  'poynter.org': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAt0lEQVR4AZyTuxGEMAxENe7gLiajhUuo4OqBBowbgD7o4Ioho49DG4iRP/JgmNmxMNq3m+CIn1/Xzax/o2a2kmMTBo+XRnl40eCJWbI8APKSnf000XsYsnt9UQVgsR9HHKZMANJhfnGDWgsboJIBsioUAUjXhlqLMkClC8hqkQHSdAFYLXJAIV0gn22T8TojgJV+bfOQ7kQA/k77ulaFHa0IsC8L3VEKCPqicQ7uexz4G59AArwnAAAA//++Va8FAAAABklEQVQDAEcdXENdhDm7AAAAAElFTkSuQmCC',
    'base64',
  ),
  'digiday.com': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdUlEQVR4AeyTQQqAIBBFv27ylAV1EPUgBXZKd9PMws0IltKiRcJHPvjfqMNY8EqrC2mdqE8ucBRWwgB5MX0iL1m+wUi4lCLPgGLG9gow7xkt6TIVQB+48z8A+OAfnJtDS7qtbzzBRE197k20y5F5LEcgJkr2AgAA//+8dwxJAAAABklEQVQDAE97Q6O5OkogAAAAAElFTkSuQmCC',
    'base64',
  ),
  'pressgazette.co.uk': Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAz0lEQVR4AZyPzQ2CQBCFxy2CErQAONEFRWi86128653YBF1w0gK0BJvAeRI2s+zsECB5ZP6+L1lH/GWHos72Rb8ozDBKDjD1dEGzKMyAdcRFCix3eWo1zJn9P2Howj/g9tRQe27CxaRTBSOM23Kbm5JIIGEIEEsSCDQYAiQl8QILhgDRJF6AgzXxgu79oup+NB3dh29u4Y0XgLQkGgwmEGCgSVIw7iMBhlJiwbhVBViMkmryZuxkHG3oKgeyhkT2Uc2s+z6eNXERLecGzID9AQAA//9eblS4AAAABklEQVQDAOn3YqlVXxLgAAAAAElFTkSuQmCC',
    'base64',
  ),
};

const WALLED_TITLE = "Nvidia's next move: custom silicon for its biggest customers";
const EMPTY_TITLE = 'A local story with no alternatives';
const NORMAL_TITLE = 'The fixture article that is not walled';
const REDIRECT_TITLE = 'The fixture article that refreshes to the unlisted host';
const SLOW_TITLE = 'A local story that takes a few seconds to find';
const FAIL_TITLE = 'A local story whose search fails';

export const DUMMY_PROVIDER = 'dummy';

/** The story of the saved answer, which the block page shows under the routes. */
export const DUMMY_TOPIC = 'Custom silicon for the biggest customers';

/** The four saved results that a non-empty answer carries, with their matches. */
export const DUMMY_RESULTS: ReadonlyArray<{
  url: string;
  title: string;
  description: string;
  domain: string;
  match: 'same_story' | 'same_event' | 'same_topic' | 'different';
}> = [
  {
    url: 'https://www.niemanlab.org/2026/09/the-ad-block-wall-is-now-the-default/',
    title: 'The ad-block wall is now the default',
    description:
      'Publishers are trading a smaller advertising audience for subscription conversions.',
    domain: 'niemanlab.org',
    match: 'same_story',
  },
  {
    url: 'https://www.poynter.org/business-work/2026/why-publishers-keep-asking-you-to-turn-off-your-ad-blocker/',
    title: 'Why publishers keep asking you to turn off your ad blocker',
    description: 'Detection scripts have become the first thing a reader meets on a news site.',
    domain: 'poynter.org',
    match: 'same_event',
  },
  {
    url: 'https://digiday.com/media/publishers-ad-block-walls-2026/',
    title: 'Publishers are betting ad-block walls convert better than paywalls',
    description:
      'A polite request reaches more readers than a hard stop, according to several media executives.',
    domain: 'digiday.com',
    match: 'same_topic',
  },
  {
    url: 'https://pressgazette.co.uk/media-audience-and-business-data/ad-blocking-walls-2026/',
    title: 'Ad blocking is falling, but the walls are staying',
    description:
      'Newer browsers ship stricter tracking protection, yet publishers say the share of blocked readers has barely moved.',
    domain: 'pressgazette.co.uk',
    match: 'different',
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
  /** The wait of the `/walled/slow` fixture. `--delay` sets it for a run. */
  slowDelayMs?: number;
  /** Every alternatives answer fails with 503, as `--fail` asks. */
  failAlternatives?: boolean;
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
  slowDelayMs: number;
  failAlternatives: boolean;
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
    return json({
      query,
      degraded: false,
      provider: DUMMY_PROVIDER,
      topic: DUMMY_TOPIC,
      alternatives: [],
    });
  }

  const alternatives = DUMMY_RESULTS.map((row, index) => {
    const alternative: Record<string, unknown> = {
      url: row.url,
      title: row.title,
      description: row.description,
      domain: row.domain,
      match: row.match,
      // Every row carries a signed favicon, so the block page draws one per row
      // and the route behind it is the same proxy as the preview image.
      favicon: imageUrl(
        ctx.origin,
        `${ctx.origin}/images/favicon/${row.domain}.png`,
        ctx.signingKey,
      ),
    };

    // The first row carries a signed image, so the block page and the image
    // proxy get one real request in a local run. It is also the best match, so
    // a local run reaches the mark that only the analysis can set.
    if (index === 0) {
      alternative.image = imageUrl(ctx.origin, `${ctx.origin}/images/preview.png`, ctx.signingKey);
      alternative.best = true;
    }

    return alternative;
  });

  return json({
    query,
    degraded: false,
    provider: DUMMY_PROVIDER,
    topic: DUMMY_TOPIC,
    alternatives,
  });
}

/**
 * The two local scenarios, chosen by the path of the article. The path already
 * decides an empty answer, so a local run reaches every state of the block page
 * through a URL and no restart.
 */
function scenarioOf(url: string): 'normal' | 'slow' | 'fail' {
  const { pathname } = new URL(url);

  if (pathname.endsWith('/slow')) {
    return 'slow';
  }

  return pathname.endsWith('/fail') ? 'fail' : 'normal';
}

/** The wait of the slow scenario, and the failure of the failing one. */
async function alternativesAnswer(
  input: { url: string; title: string },
  ctx: Ctx,
): Promise<Response> {
  const scenario = scenarioOf(input.url);

  if (ctx.failAlternatives || scenario === 'fail') {
    return errorBody(503, 'search_failed');
  }

  if (scenario === 'slow') {
    await sleep(ctx.slowDelayMs);
  }

  return answerFor(input, ctx);
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

/** The article whose search waits, so the block page shows it is still looking. */
function slowPage(): Response {
  return html(
    [`<title>${SLOW_TITLE}</title>`, `<meta property="og:title" content="${SLOW_TITLE}" />`],
    [
      `<h1>${SLOW_TITLE}</h1>`,
      '<p>This fixture article waits before the server answers the search for it.</p>',
    ],
  );
}

/** The article whose search fails, so the block page shows its failure state. */
function failPage(): Response {
  return html(
    [`<title>${FAIL_TITLE}</title>`, `<meta property="og:title" content="${FAIL_TITLE}" />`],
    [
      `<h1>${FAIL_TITLE}</h1>`,
      '<p>This fixture article makes the server refuse the search for it.</p>',
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
      '  <li><code>GET /walled/slow</code></li>',
      '  <li><code>GET /walled/fail</code></li>',
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

const FAVICON_PATH = '/images/favicon/';

/** The favicon of one saved result, at the path that its signed link names. */
function faviconResponse(pathname: string): Response | null {
  const domain = pathname.slice(FAVICON_PATH.length).replace(/\.png$/, '');
  const png = FAVICON_PNGS[domain];

  return png === undefined
    ? null
    : new Response(new Uint8Array(png), { headers: { 'Content-Type': PNG } });
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
    case '/walled/slow':
      return slowPage();
    case '/walled/fail':
      return failPage();
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
      if (pathname.startsWith(FAVICON_PATH)) {
        return faviconResponse(pathname);
      }

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

    const body = JSON.stringify(ctx.list);
    const tag = `"${createHash('sha256').update(body).digest('hex')}"`;
    const headers = { ETag: tag, 'Cache-Control': 'public, max-age=1800' };

    if (request.headers['if-none-match'] === tag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(body, {
      status: 200,
      headers: { 'content-type': JSON_TYPE, ...headers },
    });
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

    return parsed === null ? errorBody(400, 'bad_request') : alternativesAnswer(parsed, ctx);
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
  const slowDelayMs = options.slowDelayMs ?? DUMMY_SLOW_DELAY_MS;
  const failAlternatives = options.failAlternatives === true;

  // The handler needs the real origin for the links of its pages. A request
  // that carries the Host header supplies it, and the configured origin is the
  // fallback for a direct call.
  let origin = options.origin ?? (port === 0 ? 'http://127.0.0.1' : `http://${host}:${port}`);

  const server = createServer((request, response) => {
    respond(request, response, {
      origin,
      list,
      signingKey,
      fetchImpl,
      slowDelayMs,
      failAlternatives,
    });
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

const USAGE = 'usage: pnpm dummy-server [--port <number>] [--delay <ms>] [--fail]\n';

/** The value after a flag, or undefined when the run does not carry the flag. */
function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);

  return index === -1 ? undefined : process.argv[index + 1];
}

function portOf(value: string | undefined): number | null {
  if (value === undefined) {
    return DUMMY_PORT;
  }

  const port = Number.parseInt(value, 10);

  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : null;
}

function delayOf(value: string | undefined): number | null {
  if (value === undefined) {
    return DUMMY_SLOW_DELAY_MS;
  }

  const delay = Number.parseInt(value, 10);

  return Number.isInteger(delay) && delay >= 0 ? delay : null;
}

async function main(): Promise<void> {
  const port = portOf(flagValue('--port'));
  const slowDelayMs = delayOf(flagValue('--delay'));
  const failAlternatives = process.argv.includes('--fail');

  if (port === null || slowDelayMs === null) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  try {
    const server = await startDummyServer({ port, slowDelayMs, failAlternatives });

    process.stdout.write(`the dummy server listens on ${server.origin}\n`);

    if (failAlternatives) {
      process.stdout.write('every alternatives answer fails with 503\n');
    } else {
      process.stdout.write(`the slow fixture waits ${slowDelayMs} ms\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const entry = process.argv[1];

if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
