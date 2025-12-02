"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class SupabaseService {
    client = null;
    initialize() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            console.warn('⚠️ Supabase credentials not configured. Project storage will not be available.');
            return;
        }
        this.client = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
        console.log('✅ Supabase initialized');
    }
    getClient() {
        if (!this.client) {
            throw new Error('Supabase not initialized. Please configure SUPABASE_URL and SUPABASE_ANON_KEY.');
        }
        return this.client;
    }
    isAvailable() {
        return this.client !== null;
    }
    // Project operations
    async createProject(data) {
        const client = this.getClient();
        const { data: project, error } = await client
            .from('projects')
            .insert({
            ...data,
            conversation_history: [],
        })
            .select()
            .single();
        if (error)
            throw error;
        return project;
    }
    async getProject(projectId) {
        const client = this.getClient();
        const { data, error } = await client
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();
        if (error) {
            if (error.code === 'PGRST116')
                return null; // Not found
            throw error;
        }
        return data;
    }
    async getUserProjects(userId) {
        const client = this.getClient();
        const { data, error } = await client
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
        if (error)
            throw error;
        return data || [];
    }
    async updateProject(projectId, updates) {
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
        if (error)
            throw error;
        return data;
    }
    async deleteProject(projectId) {
        const client = this.getClient();
        const { error } = await client
            .from('projects')
            .delete()
            .eq('id', projectId);
        if (error)
            throw error;
    }
    // Project files operations
    async saveProjectFile(data) {
        const client = this.getClient();
        const { data: file, error } = await client
            .from('project_files')
            .upsert({
            ...data,
            updated_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error)
            throw error;
        return file;
    }
    async getProjectFiles(projectId) {
        const client = this.getClient();
        const { data, error } = await client
            .from('project_files')
            .select('*')
            .eq('project_id', projectId);
        if (error)
            throw error;
        return data || [];
    }
    async deleteProjectFiles(projectId) {
        const client = this.getClient();
        const { error } = await client
            .from('project_files')
            .delete()
            .eq('project_id', projectId);
        if (error)
            throw error;
    }
}
// Export singleton
exports.supabaseService = new SupabaseService();
//# sourceMappingURL=supabase.js.map