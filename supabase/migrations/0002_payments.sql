-- Billr payments (deposits and part payments). Run once in the Supabase SQL editor, after 0001_backup.sql
-- (Project > SQL Editor > New query > paste all of this > Run). Same rules as the other tables.

create table public.payments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  amount_kobo bigint not null default 0,
  paid_on text not null,
  method text not null default 'transfer',
  note text not null default '',
  created_at text,
  updated_at text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create trigger payments_touch before insert or update on public.payments for each row execute function public.billr_touch();
create index payments_pull on public.payments (user_id, synced_at);
alter table public.payments enable row level security;
create policy "own rows: read" on public.payments for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: add" on public.payments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: change" on public.payments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.payments from anon;
grant select, insert, update on public.payments to authenticated;
