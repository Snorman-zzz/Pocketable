"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotService = void 0;
const database_1 = require("./database");
const pg_1 = require("pg");
class SnapshotService {
    /**
     * Create a new code snapshot after successful build
     * @param projectId - Project UUID
     * @param messageId - Associated assistant message UUID (optional)
     * @param files - Complete file tree as object
     * @param sandboxId - Daytona sandbox ID (optional)
     * @param previewUrl - Preview URL (optional)
     * @returns Created snapshot
     */
    async createSnapshot(projectId, messageId, files, sandboxId, previewUrl) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        const result = await database_1.databaseService.query(`INSERT INTO code_snapshots (project_id, message_id, files, sandbox_id, preview_url, build_status)
       VALUES ($1, $2, $3, $4, $5, 'success')
       RETURNING *`, [projectId, messageId, JSON.stringify(files), sandboxId || null, previewUrl || null]);
        const snapshot = result.rows[0];
        // Parse JSON files field
        if (typeof snapshot.files === 'string') {
            snapshot.files = JSON.parse(snapshot.files);
        }
        console.log(`✅ Snapshot created: ${snapshot.id} for project ${projectId}`);
        return snapshot;
    }
    /**
     * Get a specific snapshot by ID
     * @param snapshotId - Snapshot UUID
     * @returns Snapshot or null if not found
     */
    async getSnapshot(snapshotId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        const result = await database_1.databaseService.query(`SELECT * FROM code_snapshots WHERE id = $1`, [snapshotId]);
        if (result.rows.length === 0) {
            return null;
        }
        const snapshot = result.rows[0];
        // Parse JSON files field
        if (typeof snapshot.files === 'string') {
            snapshot.files = JSON.parse(snapshot.files);
        }
        return snapshot;
    }
    /**
     * Get all snapshots for a project with associated messages (version history)
     * @param projectId - Project UUID
     * @returns Array of snapshots with message data
     */
    async getProjectSnapshots(projectId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        const result = await database_1.databaseService.query(`SELECT
        cs.id,
        cs.project_id,
        cs.message_id,
        cs.files,
        cs.sandbox_id,
        cs.preview_url,
        cs.build_status,
        cs.created_at,
        cm.content AS message_content,
        cm.role AS message_role,
        cm.created_at AS message_created_at
       FROM code_snapshots cs
       LEFT JOIN chat_messages cm ON cs.message_id = cm.id
       WHERE cs.project_id = $1
       ORDER BY cs.created_at DESC`, [projectId]);
        // Parse JSON files field for each snapshot
        return result.rows.map(snapshot => {
            if (typeof snapshot.files === 'string') {
                snapshot.files = JSON.parse(snapshot.files);
            }
            return snapshot;
        });
    }
    /**
     * Mark a chat message as an edit card and link it to a snapshot
     * @param messageId - Message UUID
     * @param snapshotId - Snapshot UUID
     */
    async markMessageAsEditCard(messageId, snapshotId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        await database_1.databaseService.query(`UPDATE chat_messages
       SET is_edit_card = true, snapshot_id = $1
       WHERE id = $2`, [snapshotId, messageId]);
        console.log(`✅ Message ${messageId} marked as edit card with snapshot ${snapshotId}`);
    }
    /**
     * Update project's current snapshot
     * @param projectId - Project UUID
     * @param snapshotId - Snapshot UUID
     */
    async updateProjectCurrentSnapshot(projectId, snapshotId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        await database_1.databaseService.query(`UPDATE projects
       SET current_snapshot_id = $1, updated_at = NOW()
       WHERE id = $2`, [snapshotId, projectId]);
        console.log(`✅ Project ${projectId} current snapshot updated to ${snapshotId}`);
    }
    /**
     * Update project's active sandbox ID
     * @param projectId - Project UUID
     * @param sandboxId - Sandbox ID (or null to clear)
     */
    async updateProjectSandbox(projectId, sandboxId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        await database_1.databaseService.query(`UPDATE projects
       SET active_sandbox_id = $1, updated_at = NOW()
       WHERE id = $2`, [sandboxId, projectId]);
        console.log(`✅ Project ${projectId} sandbox ${sandboxId ? 'set to ' + sandboxId : 'cleared'}`);
    }
    /**
     * Get the last assistant message for a project
     * @param projectId - Project UUID
     * @returns Last assistant message or null
     */
    async getLastAssistantMessage(projectId) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        const result = await database_1.databaseService.query(`SELECT id, content FROM chat_messages
       WHERE project_id = $1 AND role = 'assistant'
       ORDER BY created_at DESC
       LIMIT 1`, [projectId]);
        return result.rows.length > 0 ? result.rows[0] : null;
    }
    /**
     * Get files from a snapshot as a simple object
     * @param snapshotId - Snapshot UUID
     * @returns Files object or null if not found
     */
    async getSnapshotFiles(snapshotId) {
        const snapshot = await this.getSnapshot(snapshotId);
        return snapshot ? snapshot.files : null;
    }
    /**
     * Delete old snapshots for a project (keep only last N)
     * @param projectId - Project UUID
     * @param keepCount - Number of snapshots to keep (default 50)
     */
    async cleanupOldSnapshots(projectId, keepCount = 50) {
        if (!database_1.databaseService.isAvailable()) {
            throw new Error('Database not available');
        }
        const result = await database_1.databaseService.query(`DELETE FROM code_snapshots
       WHERE id IN (
         SELECT id FROM code_snapshots
         WHERE project_id = $1
         ORDER BY created_at DESC
         OFFSET $2
       )
       RETURNING id`, [projectId, keepCount]);
        const deletedCount = result.rows.length;
        if (deletedCount > 0) {
            console.log(`✅ Cleaned up ${deletedCount} old snapshots for project ${projectId}`);
        }
        return deletedCount;
    }
}
// Export singleton instance
exports.snapshotService = new SnapshotService();
//# sourceMappingURL=snapshot-service.js.map