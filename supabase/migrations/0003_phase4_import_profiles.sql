-- ============================================================================
-- Phase 4 (Stage 5) — saved import profiles + reminder settings
-- Paste into the Supabase SQL Editor and Run once. Requires 0001/0002.
-- Idempotent: add-column-if-not-exists on the singleton household_settings row.
-- ============================================================================

alter table household_settings
  add column if not exists import_profiles      jsonb,                     -- saved per-bank column mappings
  add column if not exists import_reminder_days int not null default 7,    -- 0 = off
  add column if not exists last_import_at        timestamptz;              -- drives the reminder nudge

-- Done. Expect "Success. No rows returned."
