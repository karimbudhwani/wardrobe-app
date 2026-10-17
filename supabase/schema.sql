-- Wardrobe app schema (Postgres / Supabase)
create table if not exists users (
  id bigint generated always as identity primary key,
  email text unique not null,
  password_hash text not null,
  name text,
  created_at timestamptz default now()
);
create table if not exists photos (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  mime text,
  created_at timestamptz default now()
);
create table if not exists items (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  photo_id bigint references photos(id) on delete set null,
  svg text,
  bbox text,
  name text,
  type text,
  category text,
  color text,
  color_hex text,
  pattern text,
  fabric text,
  seasons text,
  formality int default 2,
  cultural_style text,
  modest int default 1,
  waterproof int default 0,
  created_at timestamptz default now()
);
create table if not exists outfits (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  item_ids text,
  context text,
  reason text,
  render_photo_id bigint,
  created_at timestamptz default now()
);
create index if not exists idx_items_user on items(user_id);
create index if not exists idx_photos_user on photos(user_id);
create index if not exists idx_outfits_user on outfits(user_id);

-- Lock tables down: the app only uses the service-role key (which bypasses RLS) from the server.
-- With RLS on and no policies, the public anon key can't read or write any of these tables.
alter table users enable row level security;
alter table photos enable row level security;
alter table items enable row level security;
alter table outfits enable row level security;

-- Private Storage bucket for photos (or create it in the dashboard / via `npm run seed`).
insert into storage.buckets (id, name, public) values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;
