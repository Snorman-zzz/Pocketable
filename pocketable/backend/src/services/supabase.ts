import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database types
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

class SupabaseService {
  private client: SupabaseClient | null = null;

  initialize() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase credentials not configured. Project storage will not be available.');
      return;
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase initialized');
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase not initialized. Please configure SUPABASE_URL and SUPABASE_ANON_KEY.');
    }
    return this.client;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  // Project operations
  async createProject(data: {
    user_id: string;
    name: string;
    description?: string;
    model: 'claude' | 'gpt';
  }): Promise<Project> {
    const client = this.getClient();

    const { data: project, error } = await client
      .from('projects')
      .insert({
        ...data,
        conversation_history: [],
      })
      .select()
      .single();

    if (error) throw error;
    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const client = this.getClient();

    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const client = this.getClient();

    const { data, error } = await client
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteProject(projectId: string): Promise<void> {
    const client = this.getClient();

    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
  }

  // Project files operations
  async saveProjectFile(data: {
    project_id: string;
    file_path: string;
    content: string;
  }): Promise<ProjectFile> {
    const client = this.getClient();

    const { data: file, error } = await client
      .from('project_files')
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return file;
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    if (error) throw error;
    return data || [];
  }

  async deleteProjectFiles(projectId: string): Promise<void> {
    const client = this.getClient();

    const { error } = await client
      .from('project_files')
      .delete()
      .eq('project_id', projectId);

    if (error) throw error;
  }
}

// Export singleton
export const supabaseService = new SupabaseService();
