# Pocketable Deployment Guide

This guide covers deploying Pocketable with self-hosted Daytona to the cloud.

## Overview

Pocketable uses self-hosted Daytona for secure code execution in ephemeral sandboxes. To provide fast startup times (~30 seconds), we use a custom Daytona snapshot with Node.js pre-installed.

## Prerequisites

- Self-hosted Daytona instance deployed to cloud
- Daytona CLI installed on deployment machine
- Docker (for building custom snapshots)

## Deployment Steps

### 1. Deploy Daytona to Cloud

Follow [Daytona's self-hosted deployment guide](https://www.daytona.io/docs) to deploy Daytona to your cloud provider (AWS, GCP, Azure, etc.).

Make note of:
- `DAYTONA_API_URL` (e.g., `https://daytona.yourdomain.com/api`)
- `DAYTONA_API_KEY` (generated during setup)
- `DAYTONA_ORGANIZATION_ID` (from Daytona dashboard)
- `DAYTONA_TARGET` (your deployment target)

### 2. Create Custom Snapshot with Node.js

This is a **one-time setup** that eliminates the need for users to wait for Node.js installation.

```bash
# From project root
cd /path/to/pocketable

# Run the setup script
bash scripts/setup-daytona-snapshot.sh
```

This creates the `ubuntu-node20` snapshot with:
- Ubuntu 22.04 base
- Node.js 20 pre-installed
- npm pre-installed

**Verification:**
```bash
# List snapshots to verify
daytona snapshot list

# You should see: ubuntu-node20
```

### 3. Configure Backend Environment

Create/update `backend/.env` with your Daytona credentials:

```bash
# Self-Hosted Daytona Configuration
DAYTONA_API_KEY=your_api_key_here
DAYTONA_API_URL=https://daytona.yourdomain.com/api
DAYTONA_ORGANIZATION_ID=your_org_id_here
DAYTONA_TARGET=your_target_here

# Custom snapshot (enables fast startup)
DAYTONA_SNAPSHOT_NAME=ubuntu-node20

# Other required config
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
DATABASE_URL=your_postgres_url
PORT=3001
ROUTING_ENABLED=true
```

### 4. Deploy Backend

```bash
cd backend

# Install dependencies
npm install

# Build for production
npm run build

# Start server
npm start
```

### 5. Deploy Mobile App

```bash
cd mobile

# Update API URL in .env.production
echo "EXPO_PUBLIC_API_URL=https://api.yourdomain.com" > .env.production

# Build and deploy to app stores
# (Follow Expo deployment guides)
```

## Performance Expectations

### With Custom Snapshot (`ubuntu-node20`)
- First sandbox creation: **~30 seconds**
  - ✅ Node.js already installed (instant)
  - ⏱️ npm install Claude Code SDK (~25s)
  - ⏱️ Project setup (~5s)

### Without Custom Snapshot (fallback to `ubuntu:22.04`)
- First sandbox creation: **~90 seconds**
  - ⏱️ Node.js installation (~60s)
  - ⏱️ npm install Claude Code SDK (~25s)
  - ⏱️ Project setup (~5s)

## Troubleshooting

### Snapshot Not Found Error

If you see: `Snapshot ubuntu-node20 not found`

**Solution:**
1. Verify snapshot exists: `daytona snapshot list`
2. If missing, run setup script: `bash scripts/setup-daytona-snapshot.sh`
3. If snapshot exists but error persists, check `DAYTONA_SNAPSHOT_NAME` in `.env`

### Slow Startup Times

If sandboxes still take 90+ seconds to start:

**Check:**
1. Verify `DAYTONA_SNAPSHOT_NAME=ubuntu-node20` in backend `.env`
2. Check backend logs for: `"Sandbox image: ubuntu-node20"`
3. Look for: `"✓ Node.js found (pre-installed in snapshot)"`

**If you see:** `"⚠️ Node.js not found, installing..."`
- Snapshot doesn't have Node.js installed
- Re-run setup script

### Backend Can't Connect to Daytona

**Check:**
1. `DAYTONA_API_URL` is correct and accessible from backend
2. `DAYTONA_API_KEY` is valid (check Daytona dashboard)
3. Network allows backend → Daytona communication
4. Daytona service is running

## Updating Node.js Version

To update Node.js in the snapshot:

1. Edit `Dockerfile.ubuntu-node20` (change Node.js version)
2. Delete old snapshot: `daytona snapshot delete ubuntu-node20`
3. Re-run setup: `bash scripts/setup-daytona-snapshot.sh`
4. Restart backend

## Architecture

```
User Request (Mobile App)
    ↓
Backend API (Express)
    ↓
Daytona SDK
    ↓
Self-Hosted Daytona (Cloud)
    ↓
Creates Sandbox from ubuntu-node20 snapshot
    ↓
Runs Claude Code inside sandbox
    ↓
Returns preview URL to user
```

## Security Notes

- All code execution happens in ephemeral sandboxes (deleted after use)
- Sandboxes are isolated from each other and the host system
- API keys are only available inside sandboxes, never exposed to users
- `ephemeral: true` ensures sandboxes are auto-deleted when stopped

## Support

For issues with:
- Daytona deployment: [Daytona GitHub](https://github.com/daytonaio/daytona)
- Pocketable backend: Check backend logs
- Mobile app: Check mobile app logs

## License

See LICENSE file in project root.
