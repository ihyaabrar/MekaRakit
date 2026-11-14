-- MekaRakit game data on Neon Postgres. Users live in Neon Auth (schema neon_auth); user_id is its user id as text.
-- Access goes only through server actions (src/game/store.ts) that filter every query by the session's user id.

create table if not exists profiles (
  user_id text primary key,
  display_name text not null default '' check (char_length(display_name) <= 40),
  music smallint not null default 50 check (music between 0 and 100),
  sfx smallint not null default 70 check (sfx between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists kit_runs (
  user_id text not null,
  kit_id text not null check (kit_id ~ '^kr-[0-9]{2}$'),
  gates_cut integer not null default 0 check (gates_cut >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  nubs_left integer check (nubs_left >= 0),
  primary key (user_id, kit_id)
);

-- whole-bench snapshot so an unfinished build resumes exactly (see restoreRun in src/game/logic.ts)
alter table kit_runs add column if not exists snapshot jsonb;
