const { resolveContentSource } = require('../actions/lib/content-source');

test('returns default when no source requested', () => {
  expect(resolveContentSource(undefined, 'naboo-source', 'naboo-source')).toBe('naboo-source');
});

test('returns requested source when allow-listed', () => {
  expect(resolveContentSource('naboo-source', 'naboo-source', 'naboo-source,other-source')).toBe('naboo-source');
});

test('falls back to default when requested source is not allow-listed', () => {
  expect(resolveContentSource('evil-source', 'naboo-source', 'naboo-source')).toBe('naboo-source');
});
