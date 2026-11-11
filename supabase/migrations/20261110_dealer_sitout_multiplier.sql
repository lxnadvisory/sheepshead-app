-- Dealer / left players on the session; sit-outs and multiplier inputs on each hand.
-- Run once in the Supabase SQL editor. Only adds columns: existing rows keep
-- every stored value, and the new columns are NULL (or the default) on them.

alter table public.sessions add column if not exists dealer_pid   text;
alter table public.sessions add column if not exists left_players text[] default '{}';

alter table public.hands add column if not exists sit_out       text[];
alter table public.hands add column if not exists doubler_count int;
alter table public.hands add column if not exists last_round    boolean default false;

-- The app reads and writes with the anon key. Table-level grants already cover
-- new columns; these column grants make the access explicit for the Data API
-- without widening anything beyond select / insert / update on the new columns.
grant select (dealer_pid, left_players), insert (dealer_pid, left_players), update (dealer_pid, left_players)
  on public.sessions to anon, authenticated;
grant select (sit_out, doubler_count, last_round), insert (sit_out, doubler_count, last_round), update (sit_out, doubler_count, last_round)
  on public.hands to anon, authenticated;

-- Make the Data API see the new columns right away
notify pgrst, 'reload schema';
