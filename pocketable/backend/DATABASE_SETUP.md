# PostgreSQL Database Setup for Pocketable

## Quick Start (Local Development)

### 1. Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Access PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE pocketable;
CREATE USER pocketable_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE pocketable TO pocketable_user;

# Exit psql
\q
```

### 3. Run Schema Migration

```bash
# Apply the schema
psql -U pocketable_user -d pocketable -f src/config/database-schema.sql
```

### 4. Configure Environment Variables

Update `backend/.env`:

```env
# Database Configuration
DATABASE_URL=postgresql://pocketable_user:your_secure_password@localhost:5432/pocketable

# Or use individual variables:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=pocketable
# DB_USER=pocketable_user
# DB_PASSWORD=your_secure_password

# Existing API keys
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
```

### 5. Test Connection

```bash
# Start the backend
npm run dev

# You should see:
# ✅ Database connected successfully
```

## Database Schema Overview

### Tables

1. **users**
   - Stores user accounts (for future auth)
   - Currently has a demo user: `demo@pocketable.dev`

2. **projects**
   - User projects
   - Links to Snack URLs
   - Stores conversation metadata

3. **project_files**
   - Generated code files
   - File content, language, paths
   - Unique constraint on (project_id, file_path)

4. **chat_messages**
   - Conversation history
   - Links to projects
   - Stores reasoning and file summaries

### Key Features

- Auto-updating timestamps (`updated_at`)
- Foreign key cascades (delete project → delete files)
- Indexes for performance
- UUID primary keys

## Testing the New Architecture

### 1. Create a Project

Use the mobile app or API:

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "00000000-0000-0000-0000-000000000001",
    "name": "Test Project",
    "model": "gpt"
  }'
```

### 2. Generate Code via Chat

1. Open mobile app
2. Send message: "Build a simple counter app"
3. AI generates code
4. **New behavior:**
   - Code saved to `project_files` table
   - Chat shows: "Created 3 files" with file list
   - Preview loads from database

### 3. Verify Files in Database

```bash
psql -U pocketable_user -d pocketable

-- List all files
SELECT file_path, language, created_at
FROM project_files
ORDER BY created_at DESC;

-- View file content
SELECT file_path, content
FROM project_files
WHERE file_path = 'App.tsx';
```

### 4. Test File API

```bash
# Get all files for a project
curl http://localhost:3000/api/projects/{projectId}/files

# Get file tree
curl http://localhost:3000/api/projects/{projectId}/tree

# Get single file
curl http://localhost:3000/api/projects/{projectId}/files/App.tsx

# Regenerate Snack from DB
curl -X POST http://localhost:3000/api/projects/{projectId}/snack
```

## Troubleshooting

### Connection Failed

```bash
# Check PostgreSQL is running
brew services list  # macOS
sudo systemctl status postgresql  # Linux

# Test connection manually
psql -U pocketable_user -d pocketable
```

### Permission Denied

```bash
# Grant permissions
psql postgres
GRANT ALL PRIVILEGES ON DATABASE pocketable TO pocketable_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pocketable_user;
```

### Schema Not Applied

```bash
# Check if tables exist
psql -U pocketable_user -d pocketable
\dt

# If not, reapply schema
psql -U pocketable_user -d pocketable -f src/config/database-schema.sql
```

## Production Deployment (Future)

### AWS RDS PostgreSQL

1. Create RDS instance
2. Update `DATABASE_URL` with RDS endpoint
3. Apply schema:
   ```bash
   psql -h your-rds-endpoint.rds.amazonaws.com -U admin -d pocketable -f src/config/database-schema.sql
   ```

### Security

- Use SSL connections (`?sslmode=require`)
- Rotate passwords regularly
- Use AWS Secrets Manager for credentials
- Enable RDS automated backups
- Set up read replicas for scaling

### Infrastructure as Code

Use Terraform or AWS CDK to provision:
- RDS PostgreSQL instance
- Security groups
- Parameter groups
- Backup policies
- Monitoring/CloudWatch

## Current vs. Old Architecture

### Old (Supabase - WRONG)
- Used Supabase for Pocketable's data (incorrect usage)
- Code displayed in chat
- Preview from chat text

### New (PostgreSQL - CORRECT)
- PostgreSQL for Pocketable's backend data
- Files stored in database
- Chat shows file summaries
- Preview from database files
- Supabase reserved for users to connect to their own apps (future feature)
