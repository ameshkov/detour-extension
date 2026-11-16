/** The one shape of a page request, so a test supplies a stub instead of the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // A stream that already ended or failed has nothing left to cancel.
  }
}

/**
 * Reads at most `maxBytes` of a response body and answers null when a read fails.
 * The chunk that crosses the cap is cut, so a caller decodes a bounded page
 * without buffering a whole response.
 */
export async function readCappedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const body = response.body;

  if (body === null) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();

      if (done || value === undefined) {
        break;
      }

      // A body that yields anything but bytes cannot be measured or decoded.
      if (!(value instanceof Uint8Array)) {
        throw new TypeError('a body chunk is not bytes');
      }

      const room = maxBytes - total;
      const chunk = value.byteLength > room ? value.subarray(0, room) : value;

      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } catch {
    await cancelQuietly(reader);

    return null;
  }

  await cancelQuietly(reader);

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
