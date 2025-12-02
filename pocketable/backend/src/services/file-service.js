"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileService = void 0;
const database_1 = require("./database");
const crypto_1 = __importDefault(require("crypto"));
class FileService {
    /**
     * Save a file to the database (creates or updates)
     */
    async saveFile(projectId, filePath, content) {
        const language = this.detectLanguage(filePath);
        const result = await database_1.databaseService.query(`INSERT INTO project_files (project_id, file_path, content, language)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, file_path)
       DO UPDATE SET content = $3, language = $4, updated_at = NOW()
       RETURNING *`, [projectId, filePath, content, language]);
        return result.rows[0];
    }
    /**
     * Save multiple files in a single transaction
     */
    async saveFiles(projectId, files) {
        return database_1.databaseService.transaction(async (client) => {
            const savedFiles = [];
            for (const [filePath, content] of Object.entries(files)) {
                const language = this.detectLanguage(filePath);
                const result = await client.query(`INSERT INTO project_files (project_id, file_path, content, language)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, file_path)
           DO UPDATE SET content = $3, language = $4, updated_at = NOW()
           RETURNING *`, [projectId, filePath, content, language]);
                savedFiles.push(result.rows[0]);
            }
            return savedFiles;
        });
    }
    /**
     * Get a single file by path
     */
    async getFile(projectId, filePath) {
        const result = await database_1.databaseService.query(`SELECT * FROM project_files
       WHERE project_id = $1 AND file_path = $2`, [projectId, filePath]);
        return result.rows[0] || null;
    }
    /**
     * Get all files for a project
     */
    async getProjectFiles(projectId) {
        const result = await database_1.databaseService.query(`SELECT * FROM project_files
       WHERE project_id = $1
       ORDER BY file_path ASC`, [projectId]);
        return result.rows;
    }
    /**
     * Get files as a Record for Snack API
     */
    async getFilesForSnack(projectId) {
        const files = await this.getProjectFiles(projectId);
        const filesRecord = {};
        files.forEach((file) => {
            filesRecord[file.file_path] = file.content;
        });
        return filesRecord;
    }
    /**
     * Update a file
     */
    async updateFile(projectId, filePath, content) {
        const language = this.detectLanguage(filePath);
        const result = await database_1.databaseService.query(`UPDATE project_files
       SET content = $1, language = $2, updated_at = NOW()
       WHERE project_id = $3 AND file_path = $4
       RETURNING *`, [content, language, projectId, filePath]);
        if (result.rows.length === 0) {
            throw new Error(`File not found: ${filePath}`);
        }
        return result.rows[0];
    }
    /**
     * Delete a file
     */
    async deleteFile(projectId, filePath) {
        await database_1.databaseService.query(`DELETE FROM project_files
       WHERE project_id = $1 AND file_path = $2`, [projectId, filePath]);
    }
    /**
     * Delete all files for a project
     */
    async deleteProjectFiles(projectId) {
        await database_1.databaseService.query(`DELETE FROM project_files WHERE project_id = $1`, [projectId]);
    }
    /**
     * Get file tree structure
     */
    async getFileTree(projectId) {
        const files = await this.getProjectFiles(projectId);
        // Build tree structure from flat file paths
        const root = new Map();
        files.forEach((file) => {
            const parts = file.file_path.split('/');
            let currentLevel = root;
            parts.forEach((part, index) => {
                const isFile = index === parts.length - 1;
                const fullPath = parts.slice(0, index + 1).join('/');
                if (!currentLevel.has(part)) {
                    const node = {
                        name: part,
                        path: fullPath,
                        type: isFile ? 'file' : 'folder',
                        language: isFile ? file.language : undefined,
                    };
                    if (!isFile) {
                        node.children = [];
                    }
                    currentLevel.set(part, node);
                }
                if (!isFile) {
                    const folderNode = currentLevel.get(part);
                    if (!folderNode.children) {
                        folderNode.children = [];
                    }
                    // Create a new map for the next level
                    const childrenMap = new Map();
                    folderNode.children.forEach((child) => {
                        childrenMap.set(child.name, child);
                    });
                    currentLevel = childrenMap;
                }
            });
        });
        return Array.from(root.values());
    }
    /**
     * Get files as FileMap (Bolt-inspired format for FileTree component).
     * Automatically infers directory structure from file paths.
     */
    async getFileMap(projectId) {
        const files = await this.getProjectFiles(projectId);
        const fileMap = {};
        const directories = new Set();
        // Process all files
        for (const file of files) {
            const filePath = file.file_path;
            // Add file entry
            fileMap[filePath] = {
                type: 'file',
                content: file.content,
                isBinary: false,
            };
            // Infer parent directories
            const parts = filePath.split('/');
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath += (currentPath ? '/' : '') + parts[i];
                if (!directories.has(currentPath)) {
                    directories.add(currentPath);
                    fileMap[currentPath] = {
                        type: 'directory',
                    };
                }
            }
        }
        return fileMap;
    }
    /**
     * Calculate MD5 hash of all project files for change detection.
     * Used to determine if Snack preview needs to be regenerated.
     */
    async getProjectFilesHash(projectId) {
        const files = await this.getProjectFiles(projectId);
        // Sort by file path for consistent hashing
        const sortedFiles = files.sort((a, b) => a.file_path.localeCompare(b.file_path));
        // Concatenate all file paths and contents
        const content = sortedFiles.map(f => f.file_path + f.content).join('');
        // Calculate MD5 hash
        return crypto_1.default.createHash('md5').update(content).digest('hex');
    }
    /**
     * Detect programming language from file extension
     */
    detectLanguage(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const languageMap = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            json: 'json',
            css: 'css',
            scss: 'scss',
            md: 'markdown',
            html: 'html',
            xml: 'xml',
            yml: 'yaml',
            yaml: 'yaml',
            sh: 'shell',
            bash: 'shell',
            py: 'python',
            java: 'java',
            kt: 'kotlin',
            swift: 'swift',
            go: 'go',
            rs: 'rust',
            c: 'c',
            cpp: 'cpp',
            h: 'c',
            hpp: 'cpp',
        };
        return languageMap[ext || ''] || 'text';
    }
}
// Export singleton instance
exports.fileService = new FileService();
//# sourceMappingURL=file-service.js.map