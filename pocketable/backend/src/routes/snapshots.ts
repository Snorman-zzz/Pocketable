import { Router } from 'express';
import { snapshotService } from '../services/snapshot-service';
import { authenticateToken, verifyProjectOwnership, verifySnapshotOwnership } from '../middleware/auth';

const router = Router();

/**
 * GET /api/projects/:projectId/snapshots
 * Get all snapshots for a project (version history)
 */
router.get('/projects/:projectId/snapshots', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId } = req.params;

    const snapshots = await snapshotService.getProjectSnapshots(projectId);

    res.json({
      success: true,
      snapshots,
      count: snapshots.length,
    });
  } catch (error) {
    console.error('❌ Error fetching snapshots:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch snapshots',
    });
  }
});

/**
 * GET /api/snapshots/:snapshotId
 * Get a specific snapshot by ID
 */
router.get('/:snapshotId', authenticateToken, verifySnapshotOwnership, async (req, res) => {
  try {
    const { snapshotId } = req.params;

    const snapshot = await snapshotService.getSnapshot(snapshotId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    res.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    console.error('❌ Error fetching snapshot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch snapshot',
    });
  }
});

/**
 * GET /api/snapshots/:snapshotId/files
 * Get files from a snapshot (for "Code" button view)
 */
router.get('/:snapshotId/files', authenticateToken, verifySnapshotOwnership, async (req, res) => {
  try {
    const { snapshotId } = req.params;

    const files = await snapshotService.getSnapshotFiles(snapshotId);

    if (!files) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    // Return files as array format for easier display
    const filesArray = Object.entries(files).map(([path, content]) => ({
      path,
      content,
    }));

    res.json({
      success: true,
      files: filesArray,
      filesObject: files, // Also include object format
    });
  } catch (error) {
    console.error('❌ Error fetching snapshot files:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch snapshot files',
    });
  }
});

/**
 * POST /api/projects/:projectId/restore/:snapshotId
 * Restore a project to a previous snapshot version
 * This will regenerate the preview from the snapshot's files
 */
router.post('/projects/:projectId/restore/:snapshotId', authenticateToken, verifyProjectOwnership, async (req, res) => {
  try {
    const { projectId, snapshotId } = req.params;

    // Get the snapshot
    const snapshot = await snapshotService.getSnapshot(snapshotId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    if (snapshot.project_id !== projectId) {
      return res.status(403).json({
        success: false,
        error: 'Snapshot does not belong to this project',
      });
    }

    // Create a system message documenting the restore
    const { databaseService } = await import('../services/database');
    const result = await databaseService.query(
      `INSERT INTO chat_messages (project_id, role, content, is_edit_card, snapshot_id)
       VALUES ($1, 'system', $2, true, $3)
       RETURNING *`,
      [
        projectId,
        `Restored to version from ${new Date(snapshot.created_at).toLocaleString()}`,
        snapshotId,
      ]
    );

    const systemMessage = result.rows[0];

    // Update project's current snapshot
    await snapshotService.updateProjectCurrentSnapshot(projectId, snapshotId);

    console.log(`✅ Project ${projectId} restored to snapshot ${snapshotId}`);

    res.json({
      success: true,
      message: 'Version restored successfully',
      snapshot,
      systemMessage,
    });
  } catch (error) {
    console.error('❌ Error restoring snapshot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore snapshot',
    });
  }
});

/**
 * DELETE /api/snapshots/:snapshotId
 * Delete a snapshot (for cleanup/maintenance)
 */
router.delete('/:snapshotId', authenticateToken, verifySnapshotOwnership, async (req, res) => {
  try {
    const { snapshotId } = req.params;

    const { databaseService } = await import('../services/database');
    const result = await databaseService.query(
      `DELETE FROM code_snapshots WHERE id = $1 RETURNING id`,
      [snapshotId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    console.log(`✅ Snapshot deleted: ${snapshotId}`);

    res.json({
      success: true,
      message: 'Snapshot deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting snapshot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete snapshot',
    });
  }
});

export default router;
