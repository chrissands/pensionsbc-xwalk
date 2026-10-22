const { buildCorsHeaders, isPreflight } = require('../actions/lib/cors');

test('matches an allow-listed origin', () => {
  const headers = buildCorsHeaders(
    'https://main--pensionsbc-college--chrissands.aem.live',
    'https://main--pensionsbc-college--chrissands.aem.live,https://foo--pensionsbc-college--chrissands.aem.page',
  );
  expect(headers['Access-Control-Allow-Origin']).toBe('https://main--pensionsbc-college--chrissands.aem.live');
  expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
});

test('returns no CORS headers for a disallowed origin', () => {
  expect(buildCorsHeaders('https://evil.example', 'https://main--pensionsbc-college--chrissands.aem.live')).toEqual({});
});

test('isPreflight detects an OPTIONS request', () => {
  expect(isPreflight({ __ow_method: 'options' })).toBe(true);
  expect(isPreflight({ __ow_method: 'post' })).toBe(false);
});
