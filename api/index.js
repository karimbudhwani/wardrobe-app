// Vercel serverless entry: every request is rewritten here (see vercel.json).
// The Express app is built once per warm instance and reused across invocations.
const { createApp } = require('../src/app');

let appPromise = null;
const getApp = () => {
  if (!appPromise) appPromise = createApp().catch(err => { appPromise = null; throw err; });
  return appPromise;
};

module.exports = async function handler(req, res) {
  let app;
  try {
    app = await getApp();
  } catch (err) {
    console.error('[wardrobe] startup error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Server misconfigured: ${err.message}` }));
  }
  return app(req, res);
};
module.exports.getApp = getApp;
