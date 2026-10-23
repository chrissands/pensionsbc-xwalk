/*
 * The visitor's audience (segment) for content shown per audience: sections with an Audience
 * setting, and Event List items that swap fragments. Audiences:
 * - local: the visitor is in BC;
 * - online: anywhere else, or unknown.
 * Worked out once per visit (session storage), only on pages with audience content:
 * 1. ?audience=<name> on the link the visitor arrives on (campaign links, demos) wins; ?audience=
 *    with no value clears it and detects again;
 * 2. otherwise the province from an IP lookup (GeoJS; the visitor's IP address goes to that
 *    service), skipped when the browser sends Global Privacy Control;
 * 3. if the lookup is skipped, blocked or slow, the device time zone (BC's own zones).
 */
const PARAM = 'audience';
const KEY = 'pensionsbc-audience';
export const LOCAL = 'local';
export const ONLINE = 'online';

const GEO_LOOKUP = 'https://get.geojs.io/v1/ip/geo.json';
const GEO_TIMEOUT = 2000;
const LOCAL_AREA = { country: 'CA', region: 'British Columbia' };
// IANA zones used only in BC (East Kootenay uses America/Edmonton, shared with Alberta)
const LOCAL_TIME_ZONES = ['America/Vancouver', 'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Creston'];

const clean = (value) => (value || '').trim().toLowerCase();

function stored() {
  try {
    return clean(sessionStorage.getItem(KEY));
  } catch (e) {
    return '';
  }
}

function store(value) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch (e) {
    // storage unavailable (privacy settings): detected again on the next page
  }
}

async function fromIp() {
  if (navigator.globalPrivacyControl) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT);
  try {
    const res = await fetch(GEO_LOOKUP, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) return '';
    const geo = await res.json();
    if (!geo.country_code) return '';
    const inArea = geo.country_code === LOCAL_AREA.country && geo.region === LOCAL_AREA.region;
    return inArea ? LOCAL : ONLINE;
  } catch (e) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function fromTimeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return LOCAL_TIME_ZONES.includes(zone) ? LOCAL : ONLINE;
}

let audience;

/** The visitor's audience: LOCAL, ONLINE or a name from ?audience=. */
export default function getAudience() {
  if (!audience) {
    audience = (async () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.has(PARAM) ? clean(params.get(PARAM)) : null;
      if (requested !== null) store(requested);
      const known = requested || stored();
      if (known) return known;
      const detected = (await fromIp()) || fromTimeZone();
      store(detected);
      return detected;
    })();
  }
  return audience;
}
