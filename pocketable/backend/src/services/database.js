"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseService = void 0;
const pg_1 = require("pg");
class DatabaseService {
    pool = null;
    initialize() {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            console.warn('⚠️  DATABASE_URL not configured. Using fallback PostgreSQL settings.');
            // Fallback to individual environment variables
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'pocketable',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
                max: 20, // Maximum number of clients in the pool
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            };
            this.pool = new pg_1.Pool(config);
        }
        else {
            this.pool = new pg_1.Pool({
                connectionString: databaseUrl,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
        }
        // Test connection and run migrations
        this.pool.query('SELECT NOW()')
            .then(() => {
            console.log('✅ Database connected successfully');
            // Run auto-migration
            return this.runMigrations();
        })
            .catch((err) => {
            console.error('❌ Database connection failed:', err.message);
            console.error('   Make sure PostgreSQL is running and DATABASE_URL or DB_* variables are set correctly');
        });
        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('❌ Unexpected database error:', err);
        });
    }
    getPool() {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.pool;
    }
    async query(text, params) {
        const pool = this.getPool();
        return pool.query(text, params);
    }
    async getClient() {
        const pool = this.getPool();
        return pool.connect();
    }
    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    isAvailable() {
        return this.pool !== null;
    }
    async runMigrations() {
        try {
            console.log('🔄 Running database migrations...');
            // Step 1: Create schema if it doesn't exist
            await this.query(`
        -- Enable UUID extension
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Users table (for account management)
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Projects table
        CREATE TABLE IF NOT EXISTS projects (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          model VARCHAR(10) NOT NULL CHECK (model IN ('claude', 'gpt')),
          snack_url TEXT,
          snack_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Project files table (stores generated code)
        CREATE TABLE IF NOT EXISTS project_files (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          file_path VARCHAR(500) NOT NULL,
          content TEXT NOT NULL,
          language VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(project_id, file_path)
        );

        -- Chat messages table (conversation history)
        CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          model VARCHAR(10),
          reasoning TEXT,
          files_summary JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
        CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
      `);
            // Step 2: Create triggers and functions
            await this.query(`
        -- Function to automatically update updated_at timestamp
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);
            await this.query(`
        -- Trigger to auto-update updated_at for users
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        -- Trigger to auto-update updated_at for projects
        DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
        CREATE TRIGGER update_projects_updated_at
          BEFORE UPDATE ON projects
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        -- Trigger to auto-update updated_at for project_files
        DROP TRIGGER IF EXISTS update_project_files_updated_at ON project_files;
        CREATE TRIGGER update_project_files_updated_at
          BEFORE UPDATE ON project_files
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);
            // Step 3: Create demo users (for development)
            await this.query(`
        INSERT INTO users (id, email, username)
        VALUES
          ('00000000-0000-0000-0000-000000000001', 'demo@pocketable.dev', 'demo'),
          ('7f270e0d-b5f4-4d35-b422-d2d6cb6ff889', 'mobile@pocketable.dev', 'mobile-user')
        ON CONFLICT (email) DO NOTHING;
      `);
            // Step 4: Add columns if they don't exist (for existing databases)
            await this.query(`
        DO $$
        BEGIN
          -- Add files_hash column if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='projects' AND column_name='files_hash'
          ) THEN
            ALTER TABLE projects ADD COLUMN files_hash TEXT;
            RAISE NOTICE 'Added files_hash column to projects table';
          END IF;

          -- Add last_snack_generated_at column if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='projects' AND column_name='last_snack_generated_at'
          ) THEN
            ALTER TABLE projects ADD COLUMN last_snack_generated_at TIMESTAMPTZ;
            RAISE NOTICE 'Added last_snack_generated_at column to projects table';
          END IF;
        END $$;
      `);
            // Step 5: Run snapshot system migration
            console.log('🔄 Running snapshot system migration...');
            await this.query(`
        -- Create code_snapshots table
        CREATE TABLE IF NOT EXISTS code_snapshots (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
          files JSONB NOT NULL,
          sandbox_id TEXT,
          preview_url TEXT,
          build_status VARCHAR(20) DEFAULT 'success' CHECK (build_status IN ('success', 'failed', 'pending')),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Add columns to chat_messages
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='chat_messages' AND column_name='is_edit_card') THEN
            ALTER TABLE chat_messages ADD COLUMN is_edit_card BOOLEAN DEFAULT false;
            RAISE NOTICE 'Added is_edit_card column to chat_messages table';
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='chat_messages' AND column_name='snapshot_id') THEN
            ALTER TABLE chat_messages ADD COLUMN snapshot_id UUID REFERENCES code_snapshots(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added snapshot_id column to chat_messages table';
          END IF;
        END $$;

        -- Add columns to projects
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='projects' AND column_name='current_snapshot_id') THEN
            ALTER TABLE projects ADD COLUMN current_snapshot_id UUID REFERENCES code_snapshots(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added current_snapshot_id column to projects table';
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='projects' AND column_name='active_sandbox_id') THEN
            ALTER TABLE projects ADD COLUMN active_sandbox_id TEXT;
            RAISE NOTICE 'Added active_sandbox_id column to projects table';
          END IF;
        END $$;

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_code_snapshots_project_id ON code_snapshots(project_id);
        CREATE INDEX IF NOT EXISTS idx_code_snapshots_message_id ON code_snapshots(message_id);
        CREATE INDEX IF NOT EXISTS idx_code_snapshots_created_at ON code_snapshots(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_snapshot_id ON chat_messages(snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_is_edit_card ON chat_messages(is_edit_card) WHERE is_edit_card = true;

        -- Create view for version history
        CREATE OR REPLACE VIEW project_version_history AS
        SELECT
          cs.id AS snapshot_id,
          cs.project_id,
          cs.created_at AS snapshot_created_at,
          cs.preview_url,
          cs.sandbox_id,
          cm.id AS message_id,
          cm.content AS message_content,
          cm.role AS message_role,
          cm.created_at AS message_created_at
        FROM code_snapshots cs
        LEFT JOIN chat_messages cm ON cs.message_id = cm.id
        ORDER BY cs.project_id, cs.created_at DESC;
      `);
            console.log('✅ Snapshot system migration completed');
            // Step 6: Add routing metadata columns for agentic routing
            console.log('🔄 Adding routing metadata columns...');
            await this.query(`
        DO $$
        BEGIN
          -- routing_intent: BUILD or GENERAL
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='chat_messages' AND column_name='routing_intent'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN routing_intent VARCHAR(20);
            CREATE INDEX idx_chat_messages_routing_intent ON chat_messages(routing_intent);
            RAISE NOTICE 'Added routing_intent column to chat_messages table';
          END IF;

          -- routing_confidence: 0.0-1.0
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='chat_messages' AND column_name='routing_confidence'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN routing_confidence FLOAT;
            RAISE NOTICE 'Added routing_confidence column to chat_messages table';
          END IF;

          -- router_model: e.g., 'gpt-5-nano'
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='chat_messages' AND column_name='router_model'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN router_model VARCHAR(50);
            RAISE NOTICE 'Added router_model column to chat_messages table';
          END IF;
        END $$;
      `);
            console.log('✅ Routing metadata columns added');
            console.log('✅ Database migrations completed successfully');
        }
        catch (error) {
            console.error('❌ Failed to run migrations:', error instanceof Error ? error.message : error);
        }
    }
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            console.log('✅ Database connection pool closed');
        }
    }
}
// Export singleton instance
exports.databaseService = new DatabaseService();
//# sourceMappingURL=database.js.map