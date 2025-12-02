import { SupabaseClient } from '@supabase/supabase-js';
export interface Project {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    model: 'claude' | 'gpt';
    snack_url?: string;
    snack_id?: string;
    conversation_history: any[];
    created_at: string;
    updated_at: string;
}
export interface ProjectFile {
    id: string;
    project_id: string;
    file_path: string;
    content: string;
    created_at: string;
}
declare class SupabaseService {
    private client;
    initialize(): void;
    getClient(): SupabaseClient;
    isAvailable(): boolean;
    createProject(data: {
        user_id: string;
        name: string;
        description?: string;
        model: 'claude' | 'gpt';
    }): Promise<Project>;
    getProject(projectId: string): Promise<Project | null>;
    getUserProjects(userId: string): Promise<Project[]>;
    updateProject(projectId: string, updates: Partial<Project>): Promise<Project>;
    deleteProject(projectId: string): Promise<void>;
    saveProjectFile(data: {
        project_id: string;
        file_path: string;
        content: string;
    }): Promise<ProjectFile>;
    getProjectFiles(projectId: string): Promise<ProjectFile[]>;
    deleteProjectFiles(projectId: string): Promise<void>;
}
export declare const supabaseService: SupabaseService;
export {};
//# sourceMappingURL=supabase.d.ts.map