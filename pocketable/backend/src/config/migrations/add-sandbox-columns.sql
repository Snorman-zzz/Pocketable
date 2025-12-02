-- Migration: Add sandbox_id and preview_url to projects table
-- Run this in your PostgreSQL database or Supabase SQL Editor

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS sandbox_id TEXT,
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add index for faster sandbox lookups
CREATE INDEX IF NOT EXISTS idx_projects_sandbox_id ON projects(sandbox_id);

-- Comment the columns
COMMENT ON COLUMN projects.sandbox_id IS 'Daytona sandbox ID for this project';
COMMENT ON COLUMN projects.preview_url IS 'Live preview URL from Daytona sandbox';
