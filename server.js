// Local / long-running entry point: node server.js (PORT, default 3000).
const { createApp } = require('./src/app');
const port = process.env.PORT || 3000;
createApp()
  .then(app => app.listen(port, () => console.log(`Wardrobe running on http://localhost:${port}`)))
  .catch(err => { console.error(`[wardrobe] failed to start: ${err.message}`); process.exit(1); });
