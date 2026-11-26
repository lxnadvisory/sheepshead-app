-- Lock down players / sessions / hands (Nov 25, 2026).
--
-- Before: RLS was off, so anyone holding the public anon key (it ships in the
-- app bundle) could read every player's phone, email and venmo, and edit or
-- delete any row.
--
-- After:
--   * The PIN screen signs in to one shared Supabase account (shed@lxnadvisory.com).
--     Only that account can read players' contact details or change anything.
--   * The public pages (/stats, /night/<token>) can still read sessions and hands,
--     and see players through players_public (id, names, photo only).
--
-- The shared auth user is created separately (its password is the PIN, so it is
-- not stored in this repo).

-- Who counts as a signed-in Shed member
create or replace function public.is_shed_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'shed@lxnadvisory.com'
$$;

-- Names-only view for the public pages. Runs as its owner, so it can read
-- players even though anon cannot touch the table itself.
create or replace view public.players_public as
  select id, first_name, last_name, photo, created_at
  from public.players;
grant select on public.players_public to anon, authenticated;

-- players: members only
alter table public.players enable row level security;
revoke all on public.players from anon;
grant select, insert, update, delete on public.players to authenticated;
drop policy if exists "players members all" on public.players;
create policy "players members all" on public.players
  for all to authenticated
  using (public.is_shed_member()) with check (public.is_shed_member());

-- sessions + hands: anyone can read (scores, no personal data); members write
alter table public.sessions enable row level security;
alter table public.hands    enable row level security;
revoke insert, update, delete on public.sessions, public.hands from anon;
grant select on public.sessions, public.hands to anon;
grant select, insert, update, delete on public.sessions, public.hands to authenticated;

drop policy if exists "sessions read" on public.sessions;
create policy "sessions read" on public.sessions for select to anon, authenticated using (true);
drop policy if exists "sessions members write" on public.sessions;
create policy "sessions members write" on public.sessions for all to authenticated
  using (public.is_shed_member()) with check (public.is_shed_member());

drop policy if exists "hands read" on public.hands;
create policy "hands read" on public.hands for select to anon, authenticated using (true);
drop policy if exists "hands members write" on public.hands;
create policy "hands members write" on public.hands for all to authenticated
  using (public.is_shed_member()) with check (public.is_shed_member());

-- night_shares: links are still public to read, but only members create them
drop policy if exists "night_shares insert" on public.night_shares;
create policy "night_shares insert" on public.night_shares
  for insert to authenticated with check (public.is_shed_member());
revoke insert on public.night_shares from anon;
