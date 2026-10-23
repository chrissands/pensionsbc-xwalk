const buckets = new Map();

/**
 * Best-effort per-key fixed-window limiter. State lives in the action
 * container's memory, so it bounds abuse per warm container, not globally.
 */
function isRateLimited(key, limit, windowMs, now = Date.now()) {
  if (!key || !(limit > 0)) return false;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function clientIp(params) {
  const h = params.__ow_headers || {};
  return (h['x-forwarded-for'] || '').split(',')[0].trim();
}

module.exports = { isRateLimited, clientIp, buckets };
