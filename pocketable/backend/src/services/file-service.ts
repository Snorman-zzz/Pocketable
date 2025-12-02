import { databaseService } from './database';
import crypto from 'crypto';

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

// Bolt-inspired FileMap format
export interface FileEntry {
  type: 'file';
  content: string;
  isBinary?: boolean;
}

export interface DirectoryEntry {
  type: 'directory';
}

export type FileMap = Record<string, FileEntry | DirectoryEntry>;

class FileService {
  /**
   * Save a file to the database (creates or updates)
   */
  async saveFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<ProjectFile> {
    const language = this.detectLanguage(filePath);

    const result = await databaseService.query<ProjectFile>(
      `INSERT INTO project_files (project_id, file_path, content, language)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, file_path)
       DO UPDATE SET content = $3, language = $4, updated_at = NOW()
       RETURNING *`,
      [projectId, filePath, content, language]
    );

    return result.rows[0];
  }

  /**
   * Save multiple files in a single transaction
   */
  async saveFiles(
    projectId: string,
    files: Record<string, string>
  ): Promise<ProjectFile[]> {
    return databaseService.transaction(async (client) => {
      const savedFiles: ProjectFile[] = [];

      for (const [filePath, content] of Object.entries(files)) {
        const language = this.detectLanguage(filePath);

        const result = await client.query<ProjectFile>(
          `INSERT INTO project_files (project_id, file_path, content, language)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, file_path)
           DO UPDATE SET content = $3, language = $4, updated_at = NOW()
           RETURNING *`,
          [projectId, filePath, content, language]
        );

        savedFiles.push(result.rows[0]);
      }

      return savedFiles;
    });
  }

  /**
   * Get a single file by path
   */
  async getFile(projectId: string, filePath: string): Promise<ProjectFile | null> {
    const result = await databaseService.query<ProjectFile>(
      `SELECT * FROM project_files
       WHERE project_id = $1 AND file_path = $2`,
      [projectId, filePath]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all files for a project
   */
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const result = await databaseService.query<ProjectFile>(
      `SELECT * FROM project_files
       WHERE project_id = $1
       ORDER BY file_path ASC`,
      [projectId]
    );

    return result.rows;
  }

  /**
   * Get files as a Record for Snack API
   */
  async getFilesForSnack(projectId: string): Promise<Record<string, string>> {
    const files = await this.getProjectFiles(projectId);
    const filesRecord: Record<string, string> = {};

    files.forEach((file) => {
      filesRecord[file.file_path] = file.content;
    });

    return filesRecord;
  }

  /**
   * Update a file
   */
  async updateFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<ProjectFile> {
    const language = this.detectLanguage(filePath);

    const result = await databaseService.query<ProjectFile>(
      `UPDATE project_files
       SET content = $1, language = $2, updated_at = NOW()
       WHERE project_id = $3 AND file_path = $4
       RETURNING *`,
      [content, language, projectId, filePath]
    );

    if (result.rows.length === 0) {
      throw new Error(`File not found: ${filePath}`);
    }

    return result.rows[0];
  }

  /**
   * Delete a file
   */
  async deleteFile(projectId: string, filePath: string): Promise<void> {
    await databaseService.query(
      `DELETE FROM project_files
       WHERE project_id = $1 AND file_path = $2`,
      [projectId, filePath]
    );
  }

  /**
   * Delete all files for a project
   */
  async deleteProjectFiles(projectId: string): Promise<void> {
    await databaseService.query(
      `DELETE FROM project_files WHERE project_id = $1`,
      [projectId]
    );
  }

  /**
   * Get file tree structure
   */
  async getFileTree(projectId: string): Promise<FileTreeNode[]> {
    const files = await this.getProjectFiles(projectId);

    // Build tree structure from flat file paths
    const root: Map<string, FileTreeNode> = new Map();

    files.forEach((file) => {
      const parts = file.file_path.split('/');
      let currentLevel = root;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const fullPath = parts.slice(0, index + 1).join('/');

        if (!currentLevel.has(part)) {
          const node: FileTreeNode = {
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
          const folderNode = currentLevel.get(part)!;
          if (!folderNode.children) {
            folderNode.children = [];
          }

          // Create a new map for the next level
          const childrenMap = new Map<string, FileTreeNode>();
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
  async getFileMap(projectId: string): Promise<FileMap> {
    const files = await this.getProjectFiles(projectId);
    const fileMap: FileMap = {};
    const directories = new Set<string>();

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
  async getProjectFilesHash(projectId: string): Promise<string> {
    const files = await this.getProjectFiles(projectId);

    // Sort by file path for consistent hashing
    const sortedFiles = files.sort((a, b) => a.file_path.localeCompare(b.file_path));

    // Concatenate all file paths and contents
    const content = sortedFiles.map(f => f.file_path + f.content).join('');

    // Calculate MD5 hash
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
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
export const fileService = new FileService();
