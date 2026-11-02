import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSseBuffer, readSseStream, closeOpenMarkdown } from '../../blocks/content-ai-search/stream.js';

const START = 'event: message\ndata: {"type":"START","query":"q","result":"","hits":[]}\n\n';
const PART = 'event: message\ndata: {"type":"STREAMING","query":"q","result":"If you leave","hits":[]}\n\n';

function bodyOf(chunks) {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)));
      controller.close();
    },
  });
}

test('parseSseBuffer returns complete events and keeps the unfinished tail', () => {
  const { events, rest } = parseSseBuffer(`${START}${PART}event: message\ndata: {"type":"STRE`);
  assert.deepEqual(events.map((e) => e.type), ['START', 'STREAMING']);
  assert.equal(events[1].result, 'If you leave');
  assert.equal(rest, 'event: message\ndata: {"type":"STRE');
});

test('parseSseBuffer handles CRLF, comments and malformed events', () => {
  const crlf = PART.replace(/\n/g, '\r\n');
  const { events } = parseSseBuffer(`: keep-alive\n\n${crlf}data: {not json}\n\n`);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'STREAMING');
});

test('readSseStream reassembles events split across chunks', async () => {
  const full = `${START}${PART}`;
  const cut = full.indexOf('"STREAMING"') + 5;
  const seen = [];
  await readSseStream(bodyOf([full.slice(0, cut), full.slice(cut)]), (e) => seen.push(e.type));
  assert.deepEqual(seen, ['START', 'STREAMING']);
});

test('readSseStream delivers a final event that has no trailing blank line', async () => {
  const seen = [];
  await readSseStream(bodyOf(['event: message\ndata: {"type":"END","result":"done","hits":[]}']), (e) => seen.push(e.type));
  assert.deepEqual(seen, ['END']);
});

test('readSseStream stops when the handler throws', async () => {
  await assert.rejects(
    readSseStream(bodyOf([START, PART]), (e) => {
      if (e.type === 'STREAMING') throw new Error('stop');
    }),
    /stop/,
  );
});

test('closeOpenMarkdown closes bold and drops a link still being typed', () => {
  assert.equal(closeOpenMarkdown('Use **the plan'), 'Use **the plan**');
  assert.equal(closeOpenMarkdown('See [the guide](https://example.com/gu'), 'See ');
  assert.equal(closeOpenMarkdown('See [the gui'), 'See ');
  assert.equal(closeOpenMarkdown('See [the guide](https://example.com/a) now'), 'See [the guide](https://example.com/a) now');
  assert.equal(closeOpenMarkdown(''), '');
});
