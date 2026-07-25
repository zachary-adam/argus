-- Run this once in your Supabase SQL editor (safe to re-run)
-- Dashboard: /admin/ai-analytics

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  feature      TEXT          NOT NULL,   -- brief | ask | enrich | nlq | sitrep | brief_project
  provider     TEXT          NOT NULL,   -- claude | openai
  model        TEXT          NOT NULL,
  effort       TEXT          NOT NULL DEFAULT 'medium',  -- low | medium | high
  input_tokens  INTEGER       NOT NULL DEFAULT 0,
  output_tokens INTEGER       NOT NULL DEFAULT 0,
  total_tokens  INTEGER       NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(12,8) NOT NULL DEFAULT 0,
  duration_ms  INTEGER,
  context      TEXT,   -- e.g. country name, query string
  project_id   TEXT
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx    ON ai_usage_logs (feature);
CREATE INDEX IF NOT EXISTS ai_usage_logs_model_idx      ON ai_usage_logs (model);
CREATE INDEX IF NOT EXISTS ai_usage_logs_project_idx    ON ai_usage_logs (project_id);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_insert" ON ai_usage_logs;
DROP POLICY IF EXISTS "allow_select" ON ai_usage_logs;

-- Allow server-side API routes (anon key) to insert and read
CREATE POLICY "allow_insert" ON ai_usage_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_select" ON ai_usage_logs FOR SELECT USING (true);
