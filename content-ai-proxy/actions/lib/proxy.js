const fetch = require('node-fetch');
const { resolveContentSource } = require('./content-source');
const { buildCorsHeaders, isPreflight } = require('./cors');
const { isRateLimited, clientIp } = require('./rate-limit');

/**
 * Builds a web action that forwards POST { contentSource, query, queryOptions }
 * to Content AI `/content-sources/<endpoint>` with the API key injected
 * server-side, the source pinned to the allow-list and CORS limited to the
 * allowed origins.
 */
function createProxy(endpoint, { passQueryOptions }) {
  return async function main(params) {
    const {
      apiKey, baseUrl, defaultContentSource, allowedContentSources,
      contentSourceType, allowedOrigin, rateLimitPerMinute,
    } = params;
    const origin = (params.__ow_headers && params.__ow_headers.origin) || '';
    const headers = buildCorsHeaders(origin, allowedOrigin);

    if (isPreflight(params)) return { statusCode: 200, headers };
    if (!params.query) {
      return { statusCode: 400, headers, body: { error: 'Missing required parameter: query' } };
    }
    if (isRateLimited(clientIp(params), Number(rateLimitPerMinute) || 30, 60000)) {
      return { statusCode: 429, headers, body: { error: 'Too many requests' } };
    }

    const source = resolveContentSource(
      params.contentSource && params.contentSource.name,
      defaultContentSource,
      allowedContentSources,
    );
    const response = await fetch(`${baseUrl}/content-sources/${endpoint}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentSource: { name: source, type: contentSourceType },
        query: params.query,
        ...(passQueryOptions && params.queryOptions ? { queryOptions: params.queryOptions } : {}),
      }),
    });
    if (!response.ok) {
      return { statusCode: 502, headers, body: { error: `Content AI ${endpoint} request failed` } };
    }
    return { statusCode: response.status, headers, body: await response.json() };
  };
}

module.exports = { createProxy };
