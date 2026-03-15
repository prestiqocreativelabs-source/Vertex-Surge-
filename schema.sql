-- ──────────────────────────────────────────────────────────────
-- MapExtract Pro — Supabase Schema
-- Run this ONCE in your Supabase project → SQL Editor
-- ──────────────────────────────────────────────────────────────

-- 1. Create the places table
CREATE TABLE IF NOT EXISTS places (
  id          BIGSERIAL    PRIMARY KEY,
  osm_id      BIGINT       NOT NULL,
  search_name TEXT         NOT NULL,   -- user label e.g. "Mumbai Restaurants"
  category    TEXT,
  name        TEXT,
  address     TEXT,
  phone       TEXT,
  website     TEXT,
  has_website TEXT,
  hours       TEXT,
  lat         TEXT,
  lng         TEXT,
  maps_url    TEXT,
  saved_at    TIMESTAMPTZ  DEFAULT NOW(),

  -- Auto-deduplication: same place in same search → upsert, never duplicated
  UNIQUE (osm_id, search_name)
);

-- 2. Enable Row Level Security
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- 3. Allow anonymous read + write (uses your anon key)
CREATE POLICY "anon_all" ON places
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
