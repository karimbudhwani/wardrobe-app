#!/usr/bin/env node
// Idempotent Supabase setup + seed:
//   1. ensures the private Storage bucket (SUPABASE_BUCKET, default "wardrobe") exists
//   2. ensures the demo user demo@wardrobe.app / demo1234 exists (resets the password if it drifted)
//   3. ensures the demo user has the 29-item sample closet (only inserts missing sample items)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run seed
// Requires the tables from supabase/schema.sql to exist (run it once in the Supabase SQL editor).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Minimal .env loader (no dependency) so `npm run seed` picks up a local .env.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const { createSupabaseDb } = require('../src/db');
const { seedUser, SAMPLE } = require('../src/seed');

const DEMO_EMAIL = 'demo@wardrobe.app';
const DEMO_PASSWORD = 'demo1234';

async function ensureBucket(db) {
  const { data, error } = await db.client.storage.getBucket(db.bucket);
  if (data && !error) { console.log(`✓ bucket "${db.bucket}" exists (public: ${data.public})`); return; }
  const r = await db.client.storage.createBucket(db.bucket, { public: false });
  if (r.error && !/already exists/i.test(r.error.message)) throw new Error(`Could not create bucket "${db.bucket}": ${r.error.message}`);
  console.log(`✓ bucket "${db.bucket}" created (private)`);
}

async function main() {
  const db = createSupabaseDb();
  await ensureBucket(db);

  let user = await db.getUserByEmail(DEMO_EMAIL);
  if (!user) {
    const id = await db.createUser({ email: DEMO_EMAIL, password_hash: bcrypt.hashSync(DEMO_PASSWORD, 10), name: 'Demo' });
    user = { id };
    console.log(`✓ created demo user ${DEMO_EMAIL} (id ${id})`);
  } else {
    if (!bcrypt.compareSync(DEMO_PASSWORD, user.password_hash)) {
      await db.updateUserPassword(user.id, bcrypt.hashSync(DEMO_PASSWORD, 10));
      console.log('✓ reset demo password');
    }
    console.log(`✓ demo user exists (id ${user.id})`);
  }

  const added = await seedUser(db, user.id, { onlyMissing: true });
  console.log(added ? `✓ added ${added} sample items` : `✓ sample closet already complete (${SAMPLE.length} items)`);
}

main().catch(err => { console.error(`✗ seed failed: ${err.message}`); process.exit(1); });
