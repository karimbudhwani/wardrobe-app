// Stateless, serverless-safe sessions: a signed JWT in an httpOnly cookie ("wsid").
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { parse, serialize } = require('cookie');

const COOKIE = 'wsid';
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 days

function resolveSecret(env = process.env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.VERCEL || env.NODE_ENV === 'production') {
    throw new Error('Missing SESSION_SECRET: set it to a long random string (sessions are signed with it).');
  }
  console.warn('[wardrobe] SESSION_SECRET not set; using a random per-process secret (sessions reset on restart).');
  return crypto.randomBytes(32).toString('hex');
}

function createSessions({ secret, secure = process.env.COOKIE_SECURE === '1' } = {}) {
  const key = secret || resolveSecret();
  const opts = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  return {
    COOKIE,
    // Express middleware: sets req.uid when a valid session cookie is present.
    read(req, _res, next) {
      req.uid = null;
      const tok = parse(req.headers.cookie || '')[COOKIE];
      if (tok) {
        try {
          const p = jwt.verify(tok, key, { algorithms: ['HS256'] });
          if (p && p.uid != null) req.uid = Number(p.uid);
        } catch { /* invalid or expired -> anonymous */ }
      }
      next();
    },
    login(res, uid) {
      const tok = jwt.sign({ uid }, key, { algorithm: 'HS256', expiresIn: MAX_AGE_S });
      res.append('Set-Cookie', serialize(COOKIE, tok, { ...opts, maxAge: MAX_AGE_S }));
    },
    logout(res) {
      res.append('Set-Cookie', serialize(COOKIE, '', { ...opts, maxAge: 0, expires: new Date(0) }));
    },
  };
}

module.exports = { createSessions, resolveSecret, COOKIE, MAX_AGE_S };
