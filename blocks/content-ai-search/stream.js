// Server-Sent Events helpers for Content AI `POST /content-sources/gensearch/stream`.
// Events are `data: {"type":"START|STREAMING|END|ERROR","query":...,"result":...,"hits":[...]}`.
// Each STREAMING event carries the whole answer so far, not just the newest words.

/**
 * Splits the buffered text into complete SSE events and the unfinished remainder.
 * @param {string} buffer text received so far
 * @returns {{events: object[], rest: string}} parsed JSON payloads and the incomplete tail
 */
export function parseSseBuffer(buffer) {
  const parts = buffer.replace(/\r\n?/g, '\n').split('\n\n');
  const rest = parts.pop();
  const events = [];
  parts.forEach((part) => {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) return;
    try {
      events.push(JSON.parse(data));
    } catch (error) {
      // Ignore a malformed event and keep reading the stream.
    }
  });
  return { events, rest };
}

/**
 * Reads an SSE response body and calls onEvent for every complete event.
 * @param {ReadableStream} body response body
 * @param {(event: object) => void} onEvent called in arrival order; may throw to stop reading
 */
export async function readSseStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSseBuffer(done ? `${buffer}\n\n` : buffer);
      buffer = parsed.rest;
      parsed.events.forEach(onEvent);
      if (done) return;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Makes a partly received answer safe to render as markdown: closes an open `**` and
 * drops a link that is still being typed, so raw markup does not flash on screen.
 * @param {string} text answer received so far
 * @returns {string} text that renders cleanly
 */
export function closeOpenMarkdown(text) {
  let out = String(text || '').replace(/\[[^\]]*$|\[[^\]]*\]\([^)]*$/, '');
  if ((out.match(/\*\*/g) || []).length % 2 === 1) out += '**';
  return out;
}
