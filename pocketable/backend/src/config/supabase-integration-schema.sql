-- Supabase Integration Schema Updates for Pocketable
-- Run this after the main database-schema.sql

-- Add Supabase-related columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS has_supabase BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS first_build_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS first_build_at TIMESTAMPTZ;

-- Supabase connections table
CREATE TABLE IF NOT EXISTS supabase_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supabase_project_ref VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT NOT NULL, -- Encrypted
  api_url TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  service_role_key TEXT, -- Encrypted, optional
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id) -- One Supabase connection per project
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_supabase_connections_project_id ON supabase_connections(project_id);

-- Trigger to auto-update updated_at for supabase_connections
CREATE TRIGGER update_supabase_connections_updated_at
  BEFORE UPDATE ON supabase_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to mark first build completion
CREATE OR REPLACE FUNCTION mark_first_build_completed(p_project_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE projects
  SET
    first_build_completed = TRUE,
    first_build_at = CASE
      WHEN first_build_at IS NULL THEN NOW()
      ELSE first_build_at
    END
  WHERE id = p_project_id
    AND first_build_completed = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust based on your user roles)
-- Example for the demo user in development:
-- GRANT ALL ON supabase_connections TO demo;