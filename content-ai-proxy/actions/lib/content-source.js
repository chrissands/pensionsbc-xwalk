/**
 * Resolves the content source for a request: an explicit `requestedSource`
 * if present and allow-listed, otherwise `defaultContentSource`. Never
 * trusts the request input directly.
 */
function resolveContentSource(requestedSource, defaultContentSource, allowedContentSourcesCsv) {
  if (!requestedSource) return defaultContentSource;
  const allowed = (allowedContentSourcesCsv || '').split(',').map((s) => s.trim()).filter(Boolean);
  const permitted = allowed.length === 0
    ? requestedSource === defaultContentSource
    : allowed.includes(requestedSource);
  return permitted ? requestedSource : defaultContentSource;
}

module.exports = { resolveContentSource };
