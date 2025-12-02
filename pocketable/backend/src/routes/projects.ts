import { Router } from 'express';
import { databaseService } from '../services/database';
import { authenticateToken, verifyProjectOwnership } from '../middleware/auth';
import OpenAI from 'openai';

const router = Router();

// Transform database project to API format (snake_case to camelCase)
const transformProject = (project: any) => {
  if (!project) return null;

  return {
    ...project,
    firstBuildCompleted: project.first_build_completed,
    hasSupabase: project.has_supabase,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    userId: project.user_id,
    conversationHistory: project.conversation_history,
    currentSnapshotId: project.current_snapshot_id,
    sandboxId: project.sandbox_id,
    snackUrl: project.snack_url,
    previewUrl: project.preview_url,
  };
};

// Lazy initialize OpenAI for name generation
let openai: OpenAI | null = null;
const getOpenAI = () => {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
};

// Create a new project
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { name, description, model } = req.body;
    const userId = req.user!.id;

    if (!name || !model) {
      return res.status(400).json({
        error: 'Missing required fields: name, model',
      });
    }

    const result = await databaseService.query(
      `INSERT INTO projects (user_id, name, description, model)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, description || null, model]
    );

    const project = result.rows[0];

    console.log('✅ Project created:', project.id);

    res.json({ success: true, project: transformProject(project) });
  } catch (error) {
    console.error('❌ Error creating project:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create project',
    });
  }
});

// Get all projects for a user
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { userId } = req.params;

    // Verify user can only access their own projects
    if (userId !== req.user!.id) {
      return res.status(403).json({
        error: 'Access denied: Cannot access other users\' projects',
      });
    }

    const result = await databaseService.query(
      `SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );

    res.json({ success: true, projects: result.rows.map(transformProject) });
  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch projects',
    });
  }
});

// Get a specific project
router.get('/:projectId', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;

    const result = await databaseService.query(
      `SELECT * FROM projects WHERE id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ success: true, project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('❌ Error fetching project:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch project',
    });
  }
});

// Update a project
router.patch('/:projectId', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;

    // Build UPDATE query dynamically
    const updateFields = Object.keys(updates);
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = updateFields.map((field, i) => `${field} = $${i + 2}`).join(', ');
    const values = [projectId, ...updateFields.map(field => updates[field])];

    const result = await databaseService.query(
      `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('✅ Project updated:', result.rows[0].id);

    res.json({ success: true, project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('❌ Error updating project:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update project',
    });
  }
});

// Delete a project
router.delete('/:projectId', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;

    // Delete project (cascade will handle files)
    const result = await databaseService.query(
      `DELETE FROM projects WHERE id = $1 RETURNING id`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('✅ Project deleted:', projectId);

    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('❌ Error deleting project:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete project',
    });
  }
});

// Save project files (deprecated - use /api/projects/:projectId/files from files.ts)
router.post('/:projectId/files', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;
    const { files } = req.body; // { 'App.tsx': 'code content', ... }

    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'Invalid files object' });
    }

    const savedFiles = [];

    for (const [file_path, content] of Object.entries(files)) {
      const result = await databaseService.query(
        `INSERT INTO project_files (project_id, file_path, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, file_path)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
         RETURNING *`,
        [projectId, file_path, content]
      );
      savedFiles.push(result.rows[0]);
    }

    console.log(`✅ Saved ${savedFiles.length} files for project:`, projectId);

    res.json({ success: true, files: savedFiles });
  } catch (error) {
    console.error('❌ Error saving project files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save project files',
    });
  }
});

// Get project files
router.get('/:projectId/files', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;

    const result = await databaseService.query(
      `SELECT * FROM project_files WHERE project_id = $1 ORDER BY file_path ASC`,
      [projectId]
    );

    res.json({ success: true, files: result.rows });
  } catch (error) {
    console.error('❌ Error fetching project files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch project files',
    });
  }
});

// Get chat messages for a project (including edit cards)
router.get('/:projectId/messages', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const { projectId } = req.params;

    const result = await databaseService.query(
      `SELECT id, role, content, model, is_edit_card, snapshot_id, created_at
       FROM chat_messages
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [projectId]
    );

    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('❌ Error fetching project messages:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch project messages',
    });
  }
});

// Generate project name from conversation
router.post('/:projectId/generate-name', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { messages } = req.body; // Array of { role, content }

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Get first user message for context
    const firstUserMessage = messages.find((m: any) => m.role === 'user')?.content || '';

    if (!firstUserMessage) {
      return res.status(400).json({ error: 'No user message found' });
    }

    // Get OpenAI client
    const client = getOpenAI();
    if (!client) {
      console.log('⚠️  OpenAI not configured, skipping name generation');
      return res.json({ success: true, name: 'New conversation' });
    }

    // Generate concise name using gpt-5-nano (faster + cheaper than gpt-4o-mini)
    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: `Generate a concise 3-5 word title for this conversation. Only return the title, nothing else. Do not use quotes.

Examples:
- Weather dashboard app
- Todo list with categories
- Image gallery component

Conversation:
${firstUserMessage.slice(0, 500)}`,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
    });

    const generatedName = response.output_text?.trim() || 'New conversation';

    // Update project name in database if available
    if (databaseService.isAvailable()) {
      await databaseService.query(
        `UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2`,
        [generatedName, projectId]
      );
      console.log(`✅ Project renamed: "${generatedName}"`);
    }

    res.json({ success: true, name: generatedName });
  } catch (error) {
    console.error('❌ Error generating project name:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate project name',
    });
  }
});

// Get project knowledge (custom instructions only, not credentials)
router.get('/:id/knowledge', authenticateToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user?.id || 'TEMP_USER_ID';

    if (!databaseService.isAvailable()) {
      return res.json({ custom: '' });
    }

    // Get project with ownership check
    const result = await databaseService.query(
      `SELECT knowledge FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const knowledge = result.rows[0].knowledge || {};

    // Return only custom knowledge, not Supabase credentials
    res.json({ custom: knowledge.custom || '' });
  } catch (error) {
    console.error('Error getting project knowledge:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get project knowledge',
    });
  }
});

// Update project knowledge (custom instructions only)
router.put('/:id/knowledge', authenticateToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user?.id || 'TEMP_USER_ID';
    const { custom } = req.body;

    if (!databaseService.isAvailable()) {
      return res.json({ success: true });
    }

    // Get current knowledge to preserve Supabase credentials
    const result = await databaseService.query(
      `SELECT knowledge FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const currentKnowledge = result.rows[0].knowledge || {};

    // Update only custom knowledge, preserve Supabase credentials
    const updatedKnowledge = {
      ...currentKnowledge,
      custom: custom || '',
    };

    await databaseService.query(
      `UPDATE projects SET knowledge = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(updatedKnowledge), projectId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating project knowledge:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update project knowledge',
    });
  }
});

export default router;
