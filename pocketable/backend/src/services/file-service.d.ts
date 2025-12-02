export interface ProjectFile {
    id: string;
    project_id: string;
    file_path: string;
    content: string;
    language?: string;
    created_at: string;
    updated_at: string;
}
export interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    language?: string;
    children?: FileTreeNode[];
}
export interface FileEntry {
    type: 'file';
    content: string;
    isBinary?: boolean;
}
export interface DirectoryEntry {
    type: 'directory';
}
export type FileMap = Record<string, FileEntry | DirectoryEntry>;
declare class FileService {
    /**
     * Save a file to the database (creates or updates)
     */
    saveFile(projectId: string, filePath: string, content: string): Promise<ProjectFile>;
    /**
     * Save multiple files in a single transaction
     */
    saveFiles(projectId: string, files: Record<string, string>): Promise<ProjectFile[]>;
    /**
     * Get a single file by path
     */
    getFile(projectId: string, filePath: string): Promise<ProjectFile | null>;
    /**
     * Get all files for a project
     */
    getProjectFiles(projectId: string): Promise<ProjectFile[]>;
    /**
     * Get files as a Record for Snack API
     */
    getFilesForSnack(projectId: string): Promise<Record<string, string>>;
    /**
     * Update a file
     */
    updateFile(projectId: string, filePath: string, content: string): Promise<ProjectFile>;
    /**
     * Delete a file
     */
    deleteFile(projectId: string, filePath: string): Promise<void>;
    /**
     * Delete all files for a project
     */
    deleteProjectFiles(projectId: string): Promise<void>;
    /**
     * Get file tree structure
     */
    getFileTree(projectId: string): Promise<FileTreeNode[]>;
    /**
     * Get files as FileMap (Bolt-inspired format for FileTree component).
     * Automatically infers directory structure from file paths.
     */
    getFileMap(projectId: string): Promise<FileMap>;
    /**
     * Calculate MD5 hash of all project files for change detection.
     * Used to determine if Snack preview needs to be regenerated.
     */
    getProjectFilesHash(projectId: string): Promise<string>;
    /**
     * Detect programming language from file extension
     */
    private detectLanguage;
}
export declare const fileService: FileService;
export {};
//# sourceMappingURL=file-service.d.ts.map