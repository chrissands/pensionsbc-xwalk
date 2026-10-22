function defaultBase() {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

function parse(url, base) {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url, base ?? defaultBase());
  } catch (error) {
    return null;
  }
}

export function isSafeUrl(url, base) {
  const parsed = parse(url, base);
  return !!parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}

export function labelFromUrl(url, base) {
  const parsed = parse(url, base);
  if (!parsed) return url;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return url;
  let slug;
  try {
    slug = decodeURIComponent(segments[segments.length - 1]);
  } catch (error) {
    return url;
  }
  slug = slug
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!slug) return url;
  return slug.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
