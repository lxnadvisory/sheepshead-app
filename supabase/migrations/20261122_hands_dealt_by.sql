-- Who dealt every hand (dealer_name is only set when the dealer sits out, so
-- 5-player hands don't record it). Position stats need it on every hand.
-- Run once in the Supabase SQL editor. Adds one nullable column; no existing
-- value changes except the backfill below.

alter table public.hands add column if not exists dealt_by text;

-- Same access as the other hand columns for the app's anon key
grant select (dealt_by), insert (dealt_by), update (dealt_by)
  on public.hands to anon, authenticated;

notify pgrst, 'reload schema';

-- Backfill: hands where the dealer sat out (6–7 players) already name the dealer.
-- Old 5-player hands stay NULL and are left out of position stats.
update public.hands
   set dealt_by = dealer_name
 where dealt_by is null
   and dealer_name is not null;
