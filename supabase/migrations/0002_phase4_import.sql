-- ============================================================================
-- Phase 4 — Statement import (pending review, merchant rules, one-time income)
-- Paste this entire file into the Supabase SQL Editor and Run once.
-- Requires 0001 (households, categories, payment_methods, touch_row, is_member).
-- Idempotent (safe to re-run): guards on tables, indexes, triggers, policies,
-- and realtime publication membership.
-- ============================================================================

-- ─── Pending transactions: the shared "to review" inbox ─────────────────────
-- Rows are KEPT after they resolve (status approved/skipped) so their dedup_key
-- blocks re-imports of the same transaction. Nothing here affects the budget
-- until a human approves it into an expense / one_time_income (done client-side).
create table if not exists pending_transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  dedup_key       text not null,
  source          text not null default 'csv'  check (source in ('csv','ofx')),
  import_batch_id uuid,
  date            date not null,
  merchant        text not null default '',
  raw_description text not null default '',
  amount          numeric(12,2) not null,               -- signed: <0 out, >0 in
  direction       text not null default 'debit'   check (direction in ('debit','credit')),
  status          text not null default 'pending' check (status in ('pending','approved','skipped')),
  skip_reason     text,
  resolved_refs   jsonb,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
-- Hard block importing the same transaction twice within a household.
create unique index if not exists pending_transactions_dedup
  on pending_transactions (household_id, dedup_key);
create index if not exists pending_transactions_hh_status
  on pending_transactions (household_id, status);

-- ─── Merchant rules: remembered merchant → category (pre-fill, no auto-post) ─
create table if not exists merchant_rules (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  match             text not null,
  category_id       uuid references categories(id) on delete cascade,
  payment_method_id uuid references payment_methods(id) on delete set null,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
create index if not exists merchant_rules_hh on merchant_rules (household_id);

-- ─── One-time income: irregular, non-recurring (refund windfall, gift, etc.) ─
create table if not exists one_time_income (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  amount       numeric(12,2) not null,
  date         date not null,
  label        text not null default '',
  note         text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists one_time_income_hh on one_time_income (household_id);

-- ─── updated_at / updated_by triggers (DB-stamped, LWW immune to clock skew) ─
drop trigger if exists t_touch on pending_transactions;
create trigger t_touch before insert or update on pending_transactions for each row execute function touch_row();
drop trigger if exists t_touch on merchant_rules;
create trigger t_touch before insert or update on merchant_rules       for each row execute function touch_row();
drop trigger if exists t_touch on one_time_income;
create trigger t_touch before insert or update on one_time_income      for each row execute function touch_row();

-- ─── Table privileges (RLS still gates every row) ───────────────────────────
grant select, insert, update, delete on
  pending_transactions, merchant_rules, one_time_income
  to authenticated;

-- ─── Row-Level Security: full CRUD only within households you belong to ──────
alter table pending_transactions enable row level security;
alter table merchant_rules       enable row level security;
alter table one_time_income      enable row level security;

drop policy if exists p_all on pending_transactions;
create policy p_all on pending_transactions for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on merchant_rules;
create policy p_all on merchant_rules       for all using ( is_member(household_id) ) with check ( is_member(household_id) );
drop policy if exists p_all on one_time_income;
create policy p_all on one_time_income      for all using ( is_member(household_id) ) with check ( is_member(household_id) );

-- ─── Realtime: full row images + publication membership ─────────────────────
alter table pending_transactions replica identity full;
alter table merchant_rules       replica identity full;
alter table one_time_income      replica identity full;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pending_transactions','merchant_rules','one_time_income'] loop
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
