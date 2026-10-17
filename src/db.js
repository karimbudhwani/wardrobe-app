const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, mime TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, photo_id INTEGER, svg TEXT, bbox TEXT, name TEXT, type TEXT, category TEXT, color TEXT, color_hex TEXT, pattern TEXT, fabric TEXT, seasons TEXT, formality INTEGER DEFAULT 2, cultural_style TEXT, modest INTEGER DEFAULT 1, waterproof INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS outfits(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, item_ids TEXT, context TEXT, reason TEXT, render_photo_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`;

async function openDb(file) {
  const SQL = await initSqlJs();
  let db;
  if (file && fs.existsSync(file)) db = new SQL.Database(fs.readFileSync(file));
  else db = new SQL.Database();
  db.run(SCHEMA);
  const save = () => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(db.export())); } };
  const all = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
  return {
    all,
    get: (sql, p = []) => all(sql, p)[0],
    run: (sql, p = []) => { db.run(sql, p); const id = all('SELECT last_insert_rowid() AS id')[0].id; save(); return id; },
    save,
  };
}
module.exports = { openDb };
