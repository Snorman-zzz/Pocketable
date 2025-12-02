# Self-Hosted Daytona Setup Guide

## Quick Start

### 1. Start Daytona
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose up -d
```

### 2. Verify Daytona is Running
```bash
# Check all containers are up
docker compose ps

# Should see 13 containers running:
# - daytona-api-1
# - daytona-db-1
# - daytona-runner-1
# - daytona-registry-1
# - daytona-proxy-1
# - daytona-dex-1
# - daytona-ssh-gateway-1
# - daytona-maildev-1
# - daytona-minio-1
# - daytona-redis-1
# - daytona-jaeger-1
# - daytona-pgadmin-1
# - daytona-registry-ui-1
```

### 3. Get API Key and Organization ID
```bash
cd /Users/yuan/Documents/project/daytona/docker

# Get API key from logs (run this after first start)
docker compose logs api 2>&1 | grep "Admin user created with API key:"

# Get organization ID from database
docker compose exec -T db psql -U user -d daytona -c "SELECT id FROM organization;"
```

### 4. Configure Backend
Update `/Users/yuan/Documents/project/pocketable/backend/.env`:

```bash
# Self-Hosted Daytona Configuration
DAYTONA_API_KEY=<api-key-from-step-3>
DAYTONA_API_URL=http://localhost:3000/api
DAYTONA_ORGANIZATION_ID=<org-id-from-step-3>
DAYTONA_TARGET=us
```

### 5. Set Organization Resource Quotas
```bash
cd /Users/yuan/Documents/project/daytona/docker

# Set proper resource limits
docker compose exec -T db psql -U user -d daytona -c "UPDATE organization SET total_cpu_quota = 10, total_memory_quota = 16, total_disk_quota = 100, max_cpu_per_sandbox = 4, max_memory_per_sandbox = 8, max_disk_per_sandbox = 20 WHERE id = '<org-id-from-step-3>';"
```

### 6. Restart Backend
```bash
cd /Users/yuan/Documents/project/pocketable/backend

# Kill any existing backend processes
pkill -f "tsx watch src/server.ts"

# Start backend
npm run dev
```

### 7. Verify Everything Works
```bash
# Check backend health
curl http://localhost:3001/health

# Should return:
# {"status":"ok","daytona":true,"anthropic":true,"openai":true,"database":true}

# Check Daytona API
curl -H "Authorization: Bearer <api-key>" http://localhost:3000/api/snapshot
```

## Configuration Details

### Daytona Location
- **Working Directory**: `/Users/yuan/Documents/project/daytona/docker/`
- **Docker Compose File**: `docker-compose.yaml`

### Ports
- **Daytona API**: `http://localhost:3000`
- **Backend Server**: `http://localhost:3001`
- **Registry**: `http://localhost:6000`
- **Registry UI**: `http://localhost:5100`
- **PgAdmin**: `http://localhost:5050`

### Database Access
```bash
# Connect to Daytona database
cd /Users/yuan/Documents/project/daytona/docker
docker compose exec -T db psql -U user -d daytona
```

### Common Commands

#### Stop Daytona
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose down
```

#### Restart Daytona
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose restart
```

#### View Logs
```bash
cd /Users/yuan/Documents/project/daytona/docker

# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f runner
docker compose logs -f registry
```

#### Check Snapshot Status
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose exec -T db psql -U user -d daytona -c "SELECT name, state, \"internalName\" FROM snapshot;"
```

## Important Notes

1. **Docker Volumes**: Daytona uses persistent volumes (`daytona_registry` and `daytona_minio_data`). Never use `docker compose down -v` unless you want to delete all data.

2. **API Key Changes**: Every time you do `docker compose down` followed by `docker compose up`, a new database is created with a new API key. You must:
   - Get the new API key from logs
   - Get the new organization ID
   - Update backend `.env`
   - Set organization resource quotas
   - Restart backend

3. **Backend Must Be Restarted**: After changing `.env`, the backend must be restarted because tsx watch doesn't reload environment variables automatically.

4. **Insecure Registry**: The local registry at `localhost:6000` is HTTP-only. Docker daemon must be configured with insecure registries in `~/.docker/daemon.json`:
   ```json
   {
     "insecure-registries": [
       "localhost:6000",
       "registry:6000",
       "127.0.0.1:6000"
     ]
   }
   ```

5. **Snapshot Validation**: On first start, the `ubuntu:22.04` snapshot will be in "validating" state while it pulls from the registry. This can take a few minutes.

## Troubleshooting

### "Invalid API key" Error
1. Get the current API key: `docker compose logs api 2>&1 | grep "Admin user created with API key:"`
2. Update backend `.env` with the new key
3. Restart backend: `pkill -f "tsx watch src/server.ts" && npm run dev`

### "No available runners" Error
1. Check runner is running: `docker compose ps | grep runner`
2. Check snapshot state: `docker compose exec -T db psql -U user -d daytona -c "SELECT name, state FROM snapshot;"`
3. Check runner logs: `docker compose logs runner`

### Snapshot Stuck in "validating" State
1. Check runner logs for registry errors: `docker compose logs runner 2>&1 | grep -i error`
2. Verify insecure registry is configured in Docker daemon
3. Restart Docker Desktop if needed
4. Restart Daytona: `docker compose restart`

### Backend Can't Connect to Daytona
1. Verify Daytona API is running: `curl http://localhost:3000/api`
2. Check backend `.env` has correct `DAYTONA_API_URL=http://localhost:3000/api`
3. Restart backend after `.env` changes

### "Error forwarding request to runner: timeout of 360000ms exceeded"
**Fixed in v1.1.0**: The backend now uses asynchronous Session API instead of synchronous executeCommand, bypassing the Daytona API's 6-minute timeout limit. Long-running operations can now complete without timeout errors.

## Architecture

```
Mobile App (Expo)
    ↓ HTTP
Backend (Express on port 3001)
    ↓ HTTP API
Daytona API (port 3000)
    ↓ Internal Network
Daytona Runner (port 3003)
    ↓ Docker
Sandbox Containers (Ubuntu 22.04)
```

## Environment Files

### Backend `.env` Template
```bash
# API Keys
ANTHROPIC_API_KEY=<your-anthropic-key>
OPENAI_API_KEY=<your-openai-key>

# Self-Hosted Daytona Configuration
DAYTONA_API_KEY=<from-docker-logs>
DAYTONA_API_URL=http://localhost:3000/api
DAYTONA_ORGANIZATION_ID=<from-database>
DAYTONA_TARGET=us

# Server
PORT=3001

# PostgreSQL Database (Pocketable's backend database)
DATABASE_URL=postgresql://pocketable_user:password@localhost:5432/pocketable

# Agentic Routing
ROUTING_ENABLED=true
```

## Backup Location

Original working Daytona backup: `/Users/yuan/Documents/project/daytona-from-before/`

This backup can be used to restore if the main instance becomes corrupted.
