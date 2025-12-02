-- Migration: Add Snapshot System for Lovable-Style Version History
-- This enables conversation persistence with restore functionality

-- Step 1: Create code_snapshots table
-- Stores complete file tree snapshots at each successful build
CREATE TABLE IF NOT EXISTS code_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  files JSONB NOT NULL, -- Complete file tree: { 'App.tsx': 'content', ... }
  sandbox_id TEXT,      -- Daytona sandbox ID (if still active)
  preview_url TEXT,     -- Preview URL (may expire when sandbox deleted)
  build_status VARCHAR(20) DEFAULT 'success' CHECK (build_status IN ('success', 'failed', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Add columns to chat_messages
-- Mark messages as "edit cards" and link to snapshots
DO $$
BEGIN
  -- Add is_edit_card column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='chat_messages' AND column_name='is_edit_card') THEN
    ALTER TABLE chat_messages ADD COLUMN is_edit_card BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added is_edit_card column to chat_messages table';
  END IF;

  -- Add snapshot_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='chat_messages' AND column_name='snapshot_id') THEN
    ALTER TABLE chat_messages ADD COLUMN snapshot_id UUID REFERENCES code_snapshots(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added snapshot_id column to chat_messages table';
  END IF;
END $$;

-- Step 3: Add columns to projects
-- Track current snapshot and active sandbox
DO $$
BEGIN
  -- Add current_snapshot_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='projects' AND column_name='current_snapshot_id') THEN
    ALTER TABLE projects ADD COLUMN current_snapshot_id UUID REFERENCES code_snapshots(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added current_snapshot_id column to projects table';
  END IF;

  -- Add active_sandbox_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='projects' AND column_name='active_sandbox_id') THEN
    ALTER TABLE projects ADD COLUMN active_sandbox_id TEXT;
    RAISE NOTICE 'Added active_sandbox_id column to projects table';
  END IF;
END $$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_code_snapshots_project_id ON code_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_code_snapshots_message_id ON code_snapshots(message_id);
CREATE INDEX IF NOT EXISTS idx_code_snapshots_created_at ON code_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_snapshot_id ON chat_messages(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_edit_card ON chat_messages(is_edit_card) WHERE is_edit_card = true;

-- Step 5: Create view for easy querying of version history
CREATE OR REPLACE VIEW project_version_history AS
SELECT
  cs.id AS snapshot_id,
  cs.project_id,
  cs.created_at AS snapshot_created_at,
  cs.preview_url,
  cs.sandbox_id,
  cm.id AS message_id,
  cm.content AS message_content,
  cm.role AS message_role,
  cm.created_at AS message_created_at
FROM code_snapshots cs
LEFT JOIN chat_messages cm ON cs.message_id = cm.id
ORDER BY cs.project_id, cs.created_at DESC;

-- Migration complete
SELECT 'Snapshot system migration completed successfully!' AS status;
