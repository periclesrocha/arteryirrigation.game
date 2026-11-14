-- Global leaderboard for the Artery Irrigation Regions game.
--
-- Run this once in the same Supabase project as the arterial tree game:
-- Dashboard > SQL Editor > New query > paste this file > Run. It is safe to run again.
-- It only creates new objects (irrigation_scores, irrigation_leaderboard) and doesn't
-- touch the tree game's scores table or leaderboard.
--
-- Players have no accounts. The page reads and writes with the project's
-- publishable key, so everything below is about what that key may do:
--   * read every score (public leaderboard)
--   * add a score, within sane limits, at most once every 15 s per nickname
--   * never change or delete a score
--
-- Score = time + 10 s per mistake + 20 s per hint. Lower is better.
-- To change the penalties later, change MISTAKE_PENALTY_MS / HINT_PENALTY_MS in
-- app.js and the score_ms formula below, then run these three lines and this
-- whole file again (existing scores are recomputed with the new formula):
--   drop view if exists public.irrigation_leaderboard;
--   alter table public.irrigation_scores drop column score_ms;
--   alter table public.irrigation_scores add column score_ms integer generated always as (time_ms + mistakes * 10000 + hints * 20000) stored;

create table if not exists public.irrigation_scores (
  id           bigint generated always as identity primary key,
  nickname     text        not null,
  nickname_key text        generated always as (lower(btrim(nickname))) stored,
  mode         text        not null,
  time_ms      integer     not null,
  mistakes     integer     not null default 0,
  hints        integer     not null default 0,
  score_ms     integer     generated always as (time_ms + mistakes * 10000 + hints * 20000) stored,
  created_at   timestamptz not null default now(),

  constraint irrigation_nickname_len check (char_length(btrim(nickname)) between 1 and 24),
  constraint irrigation_mode         check (mode in ('practice', 'test')),
  -- 43 regions can't honestly be matched in under 20 seconds; nobody needs more than a day
  constraint irrigation_time_range   check (time_ms between 20000 and 86400000),
  constraint irrigation_mistakes     check (mistakes between 0 and 5000),
  constraint irrigation_hints        check (hints between 0 and 43)
);

create index if not exists irrigation_board_idx    on public.irrigation_scores (mode, score_ms);
create index if not exists irrigation_nickname_idx on public.irrigation_scores (nickname_key, created_at desc);

-- Row level security: read anything, insert with a per-nickname cooldown, nothing else
alter table public.irrigation_scores enable row level security;

drop policy if exists "Anyone can read irrigation scores" on public.irrigation_scores;
create policy "Anyone can read irrigation scores"
  on public.irrigation_scores for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can add an irrigation score" on public.irrigation_scores;
create policy "Anyone can add an irrigation score"
  on public.irrigation_scores for insert
  to anon, authenticated
  with check (
    not exists (
      select 1 from public.irrigation_scores s
      where s.nickname_key = lower(btrim(irrigation_scores.nickname))
        and s.created_at > now() - interval '15 seconds'
    )
  );

-- Best run per nickname, per mode, with the number of runs
create or replace view public.irrigation_leaderboard
  with (security_invoker = true) as
select distinct on (mode, nickname_key)
  nickname_key,
  nickname,
  mode,
  score_ms,
  time_ms,
  mistakes,
  hints,
  created_at,
  count(*) over (partition by mode, nickname_key) as runs
from public.irrigation_scores
order by mode, nickname_key, score_ms asc, created_at asc;

-- Explicit grants: Supabase no longer exposes new tables to the API automatically.
-- Only the columns a player sends can be written; id, created_at and the score are set here.
revoke all on table public.irrigation_scores from anon, authenticated;
grant select on table public.irrigation_scores to anon, authenticated;
grant insert (nickname, mode, time_ms, mistakes, hints) on table public.irrigation_scores to anon, authenticated;
grant select on table public.irrigation_leaderboard to anon, authenticated;

-- Ask the API to pick up the new table and view right away
notify pgrst, 'reload schema';
