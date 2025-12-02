import { Router } from 'express';
import { fileService } from '../services/file-service';
import { authenticateToken, verifyProjectOwnership } from '../middleware/auth';

const router = Router();

// Get all files for a project
router.get('/projects/:projectId/files', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;

    const files = await fileService.getProjectFiles(projectId);

    res.json({ success: true, files });
  } catch (error) {
    console.error('❌ Error fetching project files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch files',
    });
  }
});

// Get file tree structure
router.get('/projects/:projectId/tree', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;

    const tree = await fileService.getFileTree(projectId);

    res.json({ success: true, tree });
  } catch (error) {
    console.error('❌ Error fetching file tree:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch file tree',
    });
  }
});

// Get file map (Bolt-inspired format with inferred directories)
router.get('/projects/:projectId/filemap', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;

    const fileMap = await fileService.getFileMap(projectId);

    res.json({ success: true, fileMap });
  } catch (error) {
    console.error('❌ Error fetching file map:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch file map',
    });
  }
});

// Get a single file (using query param for path to avoid routing issues)
router.get('/projects/:projectId/file', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;
    const path = req.query.path as string;

    const file = await fileService.getFile(projectId, path);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ success: true, file });
  } catch (error) {
    console.error('❌ Error fetching file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch file',
    });
  }
});

// Create or update a file
router.post('/projects/:projectId/files', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { path, content } = req.body;

    if (!path || content === undefined) {
      return res.status(400).json({ error: 'Missing path or content' });
    }

    const file = await fileService.saveFile(projectId, path, content);

    res.json({ success: true, file });
  } catch (error) {
    console.error('❌ Error saving file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save file',
    });
  }
});

// Update a file (using query param for path to avoid routing issues)
router.put('/projects/:projectId/file', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;
    const path = req.query.path as string;
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Missing content' });
    }

    const file = await fileService.updateFile(projectId, path, content);

    res.json({ success: true, file });
  } catch (error) {
    console.error('❌ Error updating file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update file',
    });
  }
});

// Delete a file (using query param for path to avoid routing issues)
router.delete('/projects/:projectId/file', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;
    const path = req.query.path as string;

    await fileService.deleteFile(projectId, path);

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete file',
    });
  }
});

// Note: Snack regeneration removed - using Daytona sandboxes for live preview instead
// Preview URLs are now managed by the generate-daytona route and stored in projects.preview_url

export default router;
