const crypto = require('crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function createRateLimiter({ windowMs, max, message, keyGenerator }) {
  const clients = new Map();
  return (req, res, next) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

function csrfToken(req, res) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (!MUTATING_METHODS.has(req.method) || req.originalUrl.startsWith('/api/auth/login') || req.originalUrl.startsWith('/api/auth/register')) return next();
  const expected = req.session.csrfToken;
  const received = req.get('X-CSRF-Token');
  if (!expected || !received || expected.length !== received.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

function validateText(value, field, { min = 1, max = 160 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    return `${field} must be between ${min} and ${max} characters`;
  }
  return null;
}

module.exports = { createRateLimiter, csrfToken, csrfProtection, validateText };
