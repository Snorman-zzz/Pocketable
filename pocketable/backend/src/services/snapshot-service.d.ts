export interface CodeSnapshot {
    id: string;
    project_id: string;
    message_id: string | null;
    files: Record<string, string>;
    sandbox_id: string | null;
    preview_url: string | null;
    build_status: 'success' | 'failed' | 'pending';
    created_at: string;
}
export interface SnapshotWithMessage extends CodeSnapshot {
    message_content: string | null;
    message_role: string | null;
    message_created_at: string | null;
}
declare class SnapshotService {
    /**
     * Create a new code snapshot after successful build
     * @param projectId - Project UUID
     * @param messageId - Associated assistant message UUID (optional)
     * @param files - Complete file tree as object
     * @param sandboxId - Daytona sandbox ID (optional)
     * @param previewUrl - Preview URL (optional)
     * @returns Created snapshot
     */
    createSnapshot(projectId: string, messageId: string | null, files: Record<string, string>, sandboxId?: string, previewUrl?: string): Promise<CodeSnapshot>;
    /**
     * Get a specific snapshot by ID
     * @param snapshotId - Snapshot UUID
     * @returns Snapshot or null if not found
     */
    getSnapshot(snapshotId: string): Promise<CodeSnapshot | null>;
    /**
     * Get all snapshots for a project with associated messages (version history)
     * @param projectId - Project UUID
     * @returns Array of snapshots with message data
     */
    getProjectSnapshots(projectId: string): Promise<SnapshotWithMessage[]>;
    /**
     * Mark a chat message as an edit card and link it to a snapshot
     * @param messageId - Message UUID
     * @param snapshotId - Snapshot UUID
     */
    markMessageAsEditCard(messageId: string, snapshotId: string): Promise<void>;
    /**
     * Update project's current snapshot
     * @param projectId - Project UUID
     * @param snapshotId - Snapshot UUID
     */
    updateProjectCurrentSnapshot(projectId: string, snapshotId: string): Promise<void>;
    /**
     * Update project's active sandbox ID
     * @param projectId - Project UUID
     * @param sandboxId - Sandbox ID (or null to clear)
     */
    updateProjectSandbox(projectId: string, sandboxId: string | null): Promise<void>;
    /**
     * Get the last assistant message for a project
     * @param projectId - Project UUID
     * @returns Last assistant message or null
     */
    getLastAssistantMessage(projectId: string): Promise<{
        id: string;
        content: string;
    } | null>;
    /**
     * Get files from a snapshot as a simple object
     * @param snapshotId - Snapshot UUID
     * @returns Files object or null if not found
     */
    getSnapshotFiles(snapshotId: string): Promise<Record<string, string> | null>;
    /**
     * Delete old snapshots for a project (keep only last N)
     * @param projectId - Project UUID
     * @param keepCount - Number of snapshots to keep (default 50)
     */
    cleanupOldSnapshots(projectId: string, keepCount?: number): Promise<number>;
}
export declare const snapshotService: SnapshotService;
export {};
//# sourceMappingURL=snapshot-service.d.ts.map