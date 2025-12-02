# Pocketable Quick Start

## Start Everything (3 Steps)

### 1. Start Daytona
```bash
cd /Users/yuan/Documents/project/daytona/docker && docker compose up -d
```

### 2. Start Backend
```bash
cd /Users/yuan/Documents/project/pocketable/backend && npm run dev
```

### 3. Start Mobile App
```bash
cd /Users/yuan/Documents/project/pocketable/mobile && npm run start:local
```

## Verify Health

```bash
# Backend (should return {"status":"ok",...})
curl http://localhost:3001/health

# Daytona (should return HTML or JSON)
curl http://localhost:3000/api
```

## First-Time Setup

If this is the first time starting Daytona or after `docker compose down`:

1. **Get API Key:**
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose logs api 2>&1 | grep "Admin user created with API key:"
```

2. **Get Organization ID:**
```bash
docker compose exec -T db psql -U user -d daytona -c "SELECT id FROM organization;"
```

3. **Update Backend `.env`:**
```bash
cd /Users/yuan/Documents/project/pocketable/backend
# Edit .env file and update:
# DAYTONA_API_KEY=<from-step-1>
# DAYTONA_ORGANIZATION_ID=<from-step-2>
```

4. **Set Resource Quotas:**
```bash
cd /Users/yuan/Documents/project/daytona/docker
docker compose exec -T db psql -U user -d daytona -c "UPDATE organization SET total_cpu_quota = 10, total_memory_quota = 16, total_disk_quota = 100, max_cpu_per_sandbox = 4, max_memory_per_sandbox = 8, max_disk_per_sandbox = 20;"
```

5. **Restart Backend:**
```bash
pkill -f "tsx watch src/server.ts" && cd /Users/yuan/Documents/project/pocketable/backend && npm run dev
```

## Common Issues

### "Invalid API key"
→ Backend .env has wrong key. See First-Time Setup above.

### Backend won't start
→ Kill old processes: `pkill -f "tsx watch src/server.ts"`

### Mobile can't connect
→ Check backend is on port 3001: `curl http://localhost:3001/health`

### Daytona not working
→ Check all containers running: `cd /Users/yuan/Documents/project/daytona/docker && docker compose ps`

## Full Documentation

- **Complete Setup**: See [DAYTONA-SETUP.md](DAYTONA-SETUP.md)
- **Project Details**: See [CLAUDE.md](CLAUDE.md)
