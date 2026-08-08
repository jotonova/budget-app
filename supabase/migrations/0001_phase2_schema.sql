-- ============================================================================
-- Phase 2 — Shared households with live co-editing
-- Paste this entire file into the Supabase SQL Editor and Run once.
-- It is idempotent (safe to re-run): guards on extensions, enum, tables,
-- triggers, policies, and realtime publication membership.
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ─── Enum: household role ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'household_role') then
    create type household_role as enum ('owner', 'member');
  end if;
end $$;

-- ─── Helper: stamp updated_at / updated_by on every write ───────────────────
-- The DB (not the client) sets the timestamp, so Last-Write-Wins is immune to
-- client clock skew.
create or replace function touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ─── Core: households & membership ──────────────────────────────────────────
create table if not exists households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Our Household',
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         household_role not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ─── Budget data (normalized — one row per entity) ──────────────────────────
create table if not exists income_sources (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null default '',
  monthly      numeric(12,2) not null default 0,
  sort_order   int not null default 0,
  deleted_at   timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create table if not exists groups (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  essential    boolean not null default true,
  sort_order   int not null default 0,
  deleted_at   timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create table if not exists payment_methods (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  sort_order   int not null default 0,
  deleted_at   timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create table if not exists categories (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  group_id        uuid references groups(id) on delete set null,
  name            text not null,
  budgeted        numeric(12,2) not null default 0,
  essential       boolean not null default false,
  fixed           boolean not null default false,
  alert_threshold numeric(4,3) not null default 0.9,
  sort_order      int not null default 0,
  notes           text not null default '',
  kind            text not null default 'standard',   -- 'standard' | 'savings'
  deleted_at      timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

create table if not exists expenses (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  category_id       uuid references categories(id) on delete set null,
  payment_method_id uuid references payment_methods(id) on delete set null,
  amount            numeric(12,2) not null,
  date              date not null,
  description       text not null default '',
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);

-- Settings is a singleton row per household (row-level LWW, accepted tradeoff).
-- `onboarded` stays LOCAL/per-device and is intentionally NOT stored here.
create table if not exists household_settings (
  household_id            uuid primary key references households(id) on delete cascade,
  alert_threshold_default numeric(4,3) not null default 0.9,
  currency                text not null default 'USD',
  month_start_day         int not null default 1,
  app_title               text not null default 'My Budget',
  budget_name             text,
  tracking_start_date     date,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);

-- ─── Invites (share-code join) ──────────────────────────────────────────────
create table if not exists invites (
  code         text primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  max_uses     int not null default 5,
  uses         int not null default 0
);

-- ─── Helper: membership check (defined AFTER the tables it queries) ─────────
-- SECURITY DEFINER so it bypasses RLS on household_members (prevents the
-- classic infinite-recursion when a household_members policy needs to read
-- household_members). Used by every table's RLS policy. Must come after the
-- table definitions above, or creation fails with "relation does not exist".
create or replace function is_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- ─── updated_at / updated_by triggers ───────────────────────────────────────
drop trigger if exists t_touch on income_sources;
create trigger t_touch before insert or update on income_sources    for each row execute function touch_row();
drop trigger if exists t_touch on groups;
create trigger t_touch before insert or update on groups            for each row execute function touch_row();
drop trigger if exists t_touch on payment_methods;
create trigger t_touch before insert or update on payment_methods   for each row execute function touch_row();
drop trigger if exists t_touch on categories;
create trigger t_touch before insert or update on categories        for each row execute function touch_row();
drop trigger if exists t_touch on expenses;
create trigger t_touch before insert or update on expenses          for each row execute function touch_row();
drop trigger if exists t_touch on household_settings;
create trigger t_touch before insert or update on household_settings for each row execute function touch_row();

-- ─── Membership + invite RPCs (SECURITY DEFINER; membership only via these) ──
create or replace function create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare hid uuid;
begin
  insert into households(name, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Our Household'), auth.uid())
    returning id into hid;
  insert into household_members(household_id, user_id, role) values (hid, auth.uid(), 'owner');
  insert into household_settings(household_id) values (hid);
  return hid;
end $$;

create or replace function redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare inv invites;
begin
  select * into inv from invites where code = p_code for update;
  if inv.code is null      then raise exception 'Invalid invite code'; end if;
  if inv.expires_at < now() then raise exception 'Invite code has expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'Invite code has been used up'; end if;

  insert into household_members(household_id, user_id, role)
    values (inv.household_id, auth.uid(), 'member')
    on conflict (household_id, user_id) do nothing;

  update invites set uses = uses + 1 where code = p_code;
  return inv.household_id;
end $$;

grant execute on function create_household(text) to authenticated;
grant execute on function redeem_invite(text)   to authenticated;

-- ─── Table privileges (RLS still gates every row) ───────────────────────────
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  households, household_members, income_sources, groups, payment_methods,
  categories, expenses, household_settings, invites
  to authenticated;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
alter table households         enable row level security;
alter table household_members  enable row level security;
alter table income_sources     enable row level security;
alter table groups             enable row level security;
alter table payment_methods    enable row level security;
alter table categories         enable row level security;
alter table expenses           enable row level security;
alter table household_settings enable row level security;
alter table invites            enable row level security;

-- households: members read; members update; create/delete only via RPC (no policy).
drop policy if exists hh_select on households;
create policy hh_select on households for select using ( is_member(id) );
drop policy if exists hh_update on households;
create policy hh_update on households for update using ( is_member(id) ) with check ( is_member(id) );

-- household_members: see members of your households; you may remove only yourself.
-- Joining happens via redeem_invite()/create_household() (definer), so there is
-- deliberately NO user INSERT policy here.
drop policy if exists hm_select on household_members;
create policy hm_select on household_members for select using ( is_member(household_id) );
drop policy if exists hm_leave on household_members;
create policy hm_leave  on household_members for delete using ( user_id = auth.uid() );

-- Budget data: full CRUD only within households you belong to (one policy each).
drop policy if exists p_all on income_sources;
create policy p_all on income_sources     for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on groups;
create policy p_all on groups             for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on payment_methods;
create policy p_all on payment_methods    for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on categories;
create policy p_all on categories         for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on expenses;
create policy p_all on expenses           for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on household_settings;
create policy p_all on household_settings for all using ( is_member(household_id) ) with check ( is_member(household_id) );

-- invites: members of the household manage its codes; non-members redeem via RPC.
drop policy if exists inv_rw on invites;
create policy inv_rw on invites for all using ( is_member(household_id) ) with check ( is_member(household_id) );

-- ─── Realtime: full row images + publication membership ─────────────────────
alter table income_sources     replica identity full;
alter table groups             replica identity full;
alter table payment_methods    replica identity full;
alter table categories         replica identity full;
alter table expenses           replica identity full;
alter table household_settings replica identity full;
alter table household_members  replica identity full;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'income_sources','groups','payment_methods','categories',
      'expenses','household_settings','household_members','households','invites'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Done. Expect "Success. No rows returned."
