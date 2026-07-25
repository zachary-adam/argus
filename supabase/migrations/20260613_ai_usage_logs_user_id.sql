-- Run this in your Supabase SQL editor AFTER 20260613_ai_usage_logs.sql
-- Adds per-user isolation to the AI usage logs table.

-- Add user_id column (nullable — existing rows and local-mode rows stay null)
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_id_idx ON ai_usage_logs (user_id);

-- Drop the permissive read policy and replace with per-user isolation.
-- Cloud (Supabase auth): auth.uid()::text = user_id → users only see their own rows.
-- Local mode (password auth): the API route filters by user_id in the WHERE clause,
--   so this policy doesn't need to handle it — the anon key path uses app-level filtering.
DROP POLICY IF EXISTS "allow_select" ON ai_usage_logs;
DROP POLICY IF EXISTS "users_see_own_logs" ON ai_usage_logs;

CREATE POLICY "users_see_own_logs" ON ai_usage_logs
  FOR SELECT USING (
    -- Supabase-authenticated users see their own rows
    (auth.uid()::text = user_id)
    OR
    -- Server-side anon-key queries (analytics API, admin dashboard) can read all
    -- (filtered at application level in /api/ai-analytics)
    (auth.role() = 'anon')
  );

-- Insert policy stays permissive — inserts only happen from server-side API routes
-- that already know the user ID and include it in the payload.
DROP POLICY IF EXISTS "allow_insert" ON ai_usage_logs;
CREATE POLICY "allow_insert" ON ai_usage_logs FOR INSERT WITH CHECK (true);
