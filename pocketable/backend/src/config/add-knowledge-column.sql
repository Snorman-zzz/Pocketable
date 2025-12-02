-- Add knowledge column to projects table
-- This stores project-specific knowledge including custom instructions and Supabase credentials

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS knowledge JSONB DEFAULT '{"custom": "", "supabase": null}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN projects.knowledge IS 'Stores project knowledge: {"custom": "user instructions", "supabase": {"api_url": "...", "anon_key": "..."}}';