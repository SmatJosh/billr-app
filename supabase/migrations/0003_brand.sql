-- Your brand: the business logo (a small image kept as text) and its invoice colour.
-- Run once in Supabase: SQL Editor, New query, paste all of this, Run.
alter table public.businesses add column if not exists logo_data text not null default '';
alter table public.businesses add column if not exists brand_color text not null default '';

-- Make the API see the new columns straight away.
notify pgrst, 'reload schema';
