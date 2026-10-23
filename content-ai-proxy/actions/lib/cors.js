/**
 * Builds CORS response headers for a request origin against an explicit
 * allow-list (comma-separated). Returns {} (no CORS headers) when the
 * origin isn't allow-listed — the browser then blocks the response, which
 * is the correct behavior for a disallowed origin. Never returns '*'.
 */
function buildCorsHeaders(requestOrigin, allowedOriginsCsv) {
  const allowed = (allowedOriginsCsv || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!requestOrigin || !allowed.includes(requestOrigin)) return {};
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * True when the incoming request is a CORS preflight (OPTIONS).
 */
function isPreflight(params) {
  return (params.__ow_method || '').toLowerCase() === 'options';
}

module.exports = { buildCorsHeaders, isPreflight };
