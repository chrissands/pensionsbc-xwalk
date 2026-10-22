/*
 * Where blocks read AEM content (content fragments) from. On the Edge Delivery sites
 * (aem.page / aem.live) and locally that is AEM publish, which only has published content;
 * in Universal Editor (on the AEM author host) it is the author itself.
 * GraphQL persisted queries live under the configuration GRAPHQL_CONFIG.
 */
export const AEM_PUBLISH = 'https://publish-p129103-e1259800.adobeaemcloud.com';
export const GRAPHQL_CONFIG = 'pensionsbc-base';

/** The AEM host to read from on this page. */
export function aemHost() {
  return window.location.hostname.endsWith('.adobeaemcloud.com') ? window.location.origin : AEM_PUBLISH;
}

/** Runs a persisted GraphQL query (GET, cacheable) and returns its data, or null on failure. */
export async function persistedQuery(name, variables = {}) {
  // AEM reads ";name=value" from the decoded path: encode the whole segment, not only the value
  const params = Object.entries(variables).map(([k, v]) => encodeURIComponent(`;${k}=${v}`)).join('');
  const url = `${aemHost()}/graphql/execute.json/${GRAPHQL_CONFIG}/${name}${params}`;
  try {
    const res = await fetch(url, { credentials: aemHost() === AEM_PUBLISH ? 'omit' : 'include' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (e) {
    return null;
  }
}
