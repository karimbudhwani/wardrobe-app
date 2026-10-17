const { createApp } = require('./src/app');
const port = process.env.PORT || 3000;
createApp().then(app => app.listen(port, () => console.log(`Wardrobe running on http://localhost:${port}`)));
