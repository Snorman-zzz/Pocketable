import { Router, Request, Response } from 'express';
import { databaseService } from '../services/database';
import { getCachedSuggestions } from '../services/suggestions-agent';
import { authenticateToken, verifyProjectOwnership } from '../middleware/auth';

const router = Router();

/**
 * Generate smart suggestions for a project
 * POST /api/suggestions/:projectId/generate
 */
router.post('/:projectId/generate', authenticateToken, verifyProjectOwnership, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        error: 'Project ID is required'
      });
    }

    console.log(`[SUGGESTIONS] Generating suggestions for project: ${projectId}`);

    // Load project context (parallel queries for performance)
    const [historyResult, filesResult, projectResult] = await Promise.all([
      // Get last 20 messages for context
      databaseService.query(
        `SELECT role, content
         FROM chat_messages
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [projectId]
      ),
      // Get all project files
      databaseService.query(
        `SELECT file_path, content
         FROM project_files
         WHERE project_id = $1`,
        [projectId]
      ),
      // Get project details including Supabase status
      databaseService.query(
        `SELECT has_supabase
         FROM projects
         WHERE id = $1`,
        [projectId]
      ),
    ]);

    // Prepare context
    const conversationHistory = historyResult.rows.reverse(); // Oldest to newest
    const projectFiles = Object.fromEntries(
      filesResult.rows.map((f: any) => [f.file_path, f.content])
    );
    const hasSupabase = projectResult.rows[0]?.has_supabase || false;

    console.log(`[SUGGESTIONS] Project has Supabase: ${hasSupabase}`);

    // Generate suggestions using GPT-5
    const suggestions = await getCachedSuggestions({
      projectId,
      conversationHistory,
      projectFiles,
      hasSupabase,
    });

    const latencyMs = Date.now() - startTime;
    console.log(`[SUGGESTIONS] Generated ${suggestions.length} suggestions in ${latencyMs}ms`);

    // Return suggestions
    return res.json({
      success: true,
      suggestions,
      latencyMs,
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[SUGGESTIONS] Error generating suggestions:', error);

    res.status(500).json({
      error: 'Failed to generate suggestions',
      latencyMs,
    });
  }
});

/**
 * Health check for suggestions service
 * GET /api/suggestions/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'suggestions',
    model: 'gpt-5',
  });
});

export default router;