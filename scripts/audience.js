/*
 * The visitor's audience (segment) for blocks that swap content per audience, e.g. Event List.
 * It is set by the link the visitor arrives on (?audience=<name>, from an email or campaign link)
 * and kept for the visit (session storage); ?audience= with no value clears it.
 */
const PARAM = 'audience';
const KEY = 'pensionsbc-audience';

const clean = (value) => (value || '').trim().toLowerCase();

/** The visitor's audience name, or '' when none is set. */
export default function getAudience() {
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.has(PARAM)) {
      const value = clean(params.get(PARAM));
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
      return value;
    }
    return clean(sessionStorage.getItem(KEY));
  } catch (e) {
    // storage unavailable (privacy settings): the link still works for this page
    return clean(params.get(PARAM));
  }
}
