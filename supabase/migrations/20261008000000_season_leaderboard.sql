-- Season leaderboard for Marquee Night.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- There are no accounts: players type a name when they join, and the same
-- name (ignoring case and spacing) is the same person across nights.
--
-- Row-level security is on with no policies, so the public anon key used for
-- Realtime can't touch these tables. The app's API routes use the service
-- role key on the server. Results for a night can only be posted with the
-- secret token handed to the TV that opened it.

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- as last typed
  name_key    text not null unique,          -- lower-cased, spaces collapsed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.nights (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  room_code        text not null,
  host_token_hash  text not null,            -- sha256 of the TV's secret token
  created_at       timestamptz not null default now(),
  finalized_at     timestamptz               -- set once results are in
);

create table if not exists public.night_players (
  night_id    uuid not null references public.nights (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  team_name   text not null,
  place       int not null,
  team_score  int not null,
  correct     int not null,
  points      int not null,
  primary key (night_id, player_id)
);

create index if not exists night_players_player_idx on public.night_players (player_id);
create index if not exists nights_finalized_idx on public.nights (finalized_at desc);

alter table public.players enable row level security;
alter table public.nights enable row level security;
alter table public.night_players enable row level security;

-- Season standings: one row per player who has finished at least one night.
create or replace view public.leaderboard
with (security_invoker = true) as
select
  p.id,
  p.name,
  sum(np.points)::int                          as points,
  count(*)::int                                as nights,
  count(*) filter (where np.place = 1)::int    as wins,
  sum(np.correct)::int                         as correct,
  max(n.finalized_at)                          as last_played
from public.players p
join public.night_players np on np.player_id = p.id
join public.nights n on n.id = np.night_id
where n.finalized_at is not null
group by p.id, p.name;
