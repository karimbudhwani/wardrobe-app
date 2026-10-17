// Netlify Functions entry: every non-static request is rewritten here (see netlify.toml).
// The Express app is built once per warm instance and reused across invocations.
const serverless = require('serverless-http');
const { createApp } = require('../../src/app');

const FUNCTION_PREFIX = '/.netlify/functions/api';

let handlerPromise = null;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = createApp()
      .then(app => serverless(app, {
        // Base64-encode binary image responses so Netlify/Lambda don't corrupt bytes.
        binary: [
          'image/*',
          'image/svg+xml',
          'application/octet-stream',
        ],
      }))
      .catch(err => {
        handlerPromise = null;
        throw err;
      });
  }
  return handlerPromise;
}

/** Make Express see the original client path after Netlify's function rewrite. */
function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return event;
  let path = event.path || event.rawPath || '/';
  if (path === FUNCTION_PREFIX || path.startsWith(FUNCTION_PREFIX + '/')) {
    path = path.slice(FUNCTION_PREFIX.length) || '/';
  }
  // Keep query string out of path if somehow appended.
  const q = path.indexOf('?');
  if (q !== -1) path = path.slice(0, q) || '/';
  event.path = path;
  if (event.rawPath) event.rawPath = path;
  if (event.requestContext && typeof event.requestContext === 'object') {
    if (event.requestContext.path) event.requestContext.path = path;
    if (event.requestContext.http && event.requestContext.http.path) {
      event.requestContext.http.path = path;
    }
  }
  return event;
}

exports.handler = async function handler(event, context) {
  let wrapped;
  try {
    wrapped = await getHandler();
  } catch (err) {
    console.error('[wardrobe] startup error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Server misconfigured: ${err.message}` }),
    };
  }
  return wrapped(normalizeEvent(event), context);
};

// Exported for tests / local probing; require() itself never builds the app.
exports.getHandler = getHandler;
