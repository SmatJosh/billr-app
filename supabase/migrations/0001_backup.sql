-- Billr cloud backup. Run once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- The phone's database is the source of truth; these tables are its copy, one set of rows per signed-in user.
-- Ids are the phone's uids. Rows are never deleted, only marked deleted, so other phones learn about deletes.

create table public.businesses (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  owner_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  tax_id text not null default '',
  default_currency text not null default 'NGN',
  vat_default boolean not null default false,
  payment_bank_name text not null default '',
  payment_account_number text not null default '',
  payment_account_name text not null default '',
  default_notes text not null default '',
  created_at text,
  updated_at text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create table public.clients (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at text,
  updated_at text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create table public.items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null,
  name text not null default '',
  details text not null default '',
  default_price_kobo bigint not null default 0,
  created_at text,
  updated_at text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create table public.documents (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null,
  client_id uuid,
  type text not null default 'invoice',
  number text not null,
  seq integer not null,
  currency text not null default 'NGN',
  issue_date text not null,
  due_date text not null,
  terms_days integer,
  discount_type text not null default 'flat',
  discount_flat_kobo bigint not null default 0,
  discount_percent double precision not null default 0,
  vat_enabled boolean not null default false,
  notes text not null default '',
  status text not null default 'draft',
  total_kobo bigint not null default 0,
  sent_at text,
  created_at text,
  updated_at text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create table public.document_lines (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  position integer not null default 0,
  description text not null default '',
  quantity double precision not null default 1,
  unit_price_kobo bigint not null default 0,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

-- synced_at is the pull cursor, so the server sets it on every write and the phone cannot.
create function public.billr_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['businesses', 'clients', 'items', 'documents', 'document_lines'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.billr_touch()', t || '_touch', t);
    execute format('create index %I on public.%I (user_id, synced_at)', t || '_pull', t);
    execute format('alter table public.%I enable row level security', t);
    -- Each signed-in person can read and write only their own rows. No one can hard-delete.
    execute format('create policy "own rows: read" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows: add" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows: change" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;
