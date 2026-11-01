-- Read-only share links for one game night: /night/<token>
-- Run once in the Supabase SQL editor. Touches no existing table.

create table if not exists public.night_shares (
  id          uuid        primary key default gen_random_uuid(),
  token       text        not null unique check (length(token) >= 20),
  night_date  date        not null,
  session_ids uuid[]      not null,
  created_at  timestamptz not null default now()
);

create index if not exists night_shares_night_date_idx on public.night_shares (night_date);

-- The app talks to Supabase with the anon key. Links can be created and read,
-- never edited or deleted from the client.
alter table public.night_shares enable row level security;

drop policy if exists "night_shares select" on public.night_shares;
create policy "night_shares select" on public.night_shares
  for select to anon, authenticated using (true);

drop policy if exists "night_shares insert" on public.night_shares;
create policy "night_shares insert" on public.night_shares
  for insert to anon, authenticated with check (true);

-- New tables are not exposed to the Data API without explicit grants
grant select, insert on public.night_shares to anon, authenticated;
grant all            on public.night_shares to service_role;
