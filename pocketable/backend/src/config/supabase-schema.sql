-- Supabase Database Schema for Pocketable
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL CHECK (model IN ('claude', 'gpt')),
  snack_url TEXT,
  snack_id TEXT,
  files_hash TEXT,
  last_snack_generated_at TIMESTAMPTZ,
  conversation_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add new columns if they don't exist (for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='files_hash') THEN
    ALTER TABLE projects ADD COLUMN files_hash TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='last_snack_generated_at') THEN
    ALTER TABLE projects ADD COLUMN last_snack_generated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Project files table
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, file_path)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
-- Note: For simplicity, we're using user_id as a string.
-- In production, integrate with Supabase Auth and use auth.uid()

-- Allow users to read their own projects
CREATE POLICY "Users can read own projects"
  ON projects FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Allow users to create projects
CREATE POLICY "Users can create projects"
  ON projects FOR INSERT
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Allow users to update their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Allow users to delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- RLS Policies for project_files
CREATE POLICY "Users can read own project files"
  ON project_files FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY "Users can create project files"
  ON project_files FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY "Users can update own project files"
  ON project_files FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY "Users can delete own project files"
  ON project_files FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for project_files
CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
