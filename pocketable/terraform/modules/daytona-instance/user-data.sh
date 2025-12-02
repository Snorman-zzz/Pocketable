#!/bin/bash
set -euo pipefail

# Log all output
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "==================================="
echo "Daytona Instance Setup Started"
echo "==================================="

# Update system
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    jq \
    unzip \
    awscli

# Install Docker
echo "Installing Docker..."
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Configure Docker for insecure registries
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "insecure-registries": [
    "localhost:6000",
    "registry:6000",
    "127.0.0.1:6000"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

systemctl restart docker
systemctl enable docker

# Mount EBS volume for persistent data
echo "Setting up persistent storage..."
DATA_DEVICE="${data_volume_device}"
MOUNT_POINT="${data_mount_point}"

# Wait for device to be available
while [ ! -e "$DATA_DEVICE" ]; do
    echo "Waiting for $DATA_DEVICE..."
    sleep 2
done

# Check if volume has a filesystem
if ! blkid "$DATA_DEVICE"; then
    echo "Creating filesystem on $DATA_DEVICE..."
    mkfs.ext4 "$DATA_DEVICE"
fi

# Create mount point and mount
mkdir -p "$MOUNT_POINT"
mount "$DATA_DEVICE" "$MOUNT_POINT"

# Add to fstab for persistence across reboots
DEVICE_UUID=$(blkid -s UUID -o value "$DATA_DEVICE")
echo "UUID=$DEVICE_UUID $MOUNT_POINT ext4 defaults,nofail 0 2" >> /etc/fstab

# Create directory structure
mkdir -p "$MOUNT_POINT/daytona"
mkdir -p /home/ubuntu/daytona

# Clone Daytona repository (or copy docker-compose from artifact)
cd /home/ubuntu/daytona

# Create docker-compose.yaml for Daytona
cat > docker-compose.yaml <<'COMPOSE_EOF'
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: daytona
    volumes:
      - ${data_mount_point}/daytona/postgres:/var/lib/postgresql/data
    networks:
      - daytona-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d daytona"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - ${data_mount_point}/daytona/redis:/data
    networks:
      - daytona-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - ${data_mount_point}/daytona/minio:/data
    networks:
      - daytona-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  registry:
    image: registry:2
    environment:
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /var/lib/registry
    volumes:
      - ${data_mount_point}/daytona/registry:/var/lib/registry
    networks:
      - daytona-network
    ports:
      - "6000:5000"

  registry-ui:
    image: joxit/docker-registry-ui:latest
    environment:
      REGISTRY_TITLE: Daytona Registry
      REGISTRY_URL: http://registry:5000
      DELETE_IMAGES: "true"
      SINGLE_REGISTRY: "true"
    networks:
      - daytona-network
    ports:
      - "5100:80"
    depends_on:
      - registry

  dex:
    image: dexidp/dex:v2.37.0
    command: dex serve /etc/dex/config.yaml
    volumes:
      - ./dex-config.yaml:/etc/dex/config.yaml:ro
    networks:
      - daytona-network
    ports:
      - "5556:5556"

  maildev:
    image: maildev/maildev:latest
    networks:
      - daytona-network
    ports:
      - "1080:1080"
      - "1025:1025"

  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_ZIPKIN_HOST_PORT: ":9411"
    networks:
      - daytona-network
    ports:
      - "16686:16686"

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@daytona.local
      PGADMIN_DEFAULT_PASSWORD: admin
      PGADMIN_CONFIG_SERVER_MODE: 'False'
    networks:
      - daytona-network
    ports:
      - "5050:80"
    depends_on:
      - db

  proxy:
    image: daytonaio/daytona-proxy:latest
    networks:
      - daytona-network

  ssh-gateway:
    image: daytonaio/daytona-ssh-gateway:latest
    networks:
      - daytona-network
    ports:
      - "2222:2222"

  api:
    image: daytonaio/daytona-api:latest
    environment:
      DATABASE_URL: postgresql://user:password@db:5432/daytona?sslmode=disable
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      REGISTRY_URL: http://registry:5000
      DEX_URL: http://dex:5556
      SMTP_HOST: maildev
      SMTP_PORT: "1025"
      JAEGER_ENDPOINT: http://jaeger:14268/api/traces
    networks:
      - daytona-network
    ports:
      - "3000:3000"
    depends_on:
      - db
      - redis
      - minio
      - registry
      - dex

  runner:
    image: daytonaio/daytona-runner:latest
    privileged: true
    environment:
      API_URL: http://api:3000
      REGISTRY_URL: registry:5000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${data_mount_point}/daytona/runner:/var/lib/daytona-runner
    networks:
      - daytona-network
    depends_on:
      - api
      - registry

networks:
  daytona-network:
    driver: bridge

volumes:
  daytona_postgres:
  daytona_redis:
  daytona_minio:
  daytona_registry:
  daytona_runner:
COMPOSE_EOF

# Create minimal dex config
cat > dex-config.yaml <<'DEX_EOF'
issuer: http://dex:5556/dex

storage:
  type: memory

web:
  http: 0.0.0.0:5556

staticClients:
- id: daytona
  redirectURIs:
  - 'http://localhost:3000/auth/callback'
  name: 'Daytona'
  secret: daytona-secret

enablePasswordDB: true

staticPasswords:
- email: "admin@daytona.local"
  hash: "$2a$10$2b2cU8CPhOTaGrs1HRQuAueS7JTT5ZHsHSzYiFPm1leZck7Mc8T4W"
  username: "admin"
  userID: "08a8684b-db88-4b73-90a9-3cd1661f5466"
DEX_EOF

# Create .env file for backend
cat > /home/ubuntu/.env <<ENV_EOF
# API Keys (from AWS Secrets Manager)
ANTHROPIC_API_KEY=${anthropic_api_key}
OPENAI_API_KEY=${openai_api_key}

# Self-Hosted Daytona Configuration (will be populated after first start)
DAYTONA_API_KEY=
DAYTONA_API_URL=http://localhost:3000/api
DAYTONA_ORGANIZATION_ID=
DAYTONA_TARGET=us

# Custom snapshot name
DAYTONA_SNAPSHOT_NAME=ubuntu-node20

# Server
PORT=3001

# Database
DATABASE_URL=postgresql://pocketable_user:password@localhost:5432/pocketable

# Agentic Routing
ROUTING_ENABLED=true
ENV_EOF

chown ubuntu:ubuntu /home/ubuntu/.env

# Start Daytona
echo "Starting Daytona..."
cd /home/ubuntu/daytona
docker compose up -d

# Wait for API to be ready
echo "Waiting for Daytona API to be ready..."
for i in {1..60}; do
    if curl -s http://localhost:3000/api > /dev/null; then
        echo "Daytona API is ready!"
        break
    fi
    echo "Waiting... ($i/60)"
    sleep 5
done

# Extract API key and organization ID
sleep 10  # Give it a bit more time
API_KEY=$(docker compose logs api 2>&1 | grep "Admin user created with API key:" | tail -1 | awk '{print $NF}')
ORG_ID=$(docker compose exec -T db psql -U user -d daytona -c "SELECT id FROM organization;" | grep -E '^[[:space:]]*[a-f0-9-]{36}' | tr -d ' ')

# Update .env with credentials
sed -i "s/DAYTONA_API_KEY=.*/DAYTONA_API_KEY=$API_KEY/" /home/ubuntu/.env
sed -i "s/DAYTONA_ORGANIZATION_ID=.*/DAYTONA_ORGANIZATION_ID=$ORG_ID/" /home/ubuntu/.env

# Set organization resource quotas
docker compose exec -T db psql -U user -d daytona -c "UPDATE organization SET total_cpu_quota = 10, total_memory_quota = 16, total_disk_quota = 100, max_cpu_per_sandbox = 4, max_memory_per_sandbox = 8, max_disk_per_sandbox = 20 WHERE id = '$ORG_ID';"

# Build and register ubuntu-node20 snapshot
echo "Building ubuntu-node20 snapshot..."
cd /home/ubuntu
cat > Dockerfile.ubuntu-node20 <<'DOCKERFILE_EOF'
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN node --version && npm --version

WORKDIR /root

LABEL description="Ubuntu 22.04 with Node.js 20 pre-installed for Pocketable"
LABEL version="1.0"
DOCKERFILE_EOF

docker build --platform linux/amd64 -f Dockerfile.ubuntu-node20 -t ubuntu-node20:amd64 .
docker tag ubuntu-node20:amd64 localhost:6000/daytona/ubuntu-node20:amd64
docker push localhost:6000/daytona/ubuntu-node20:amd64

# Register snapshot in database
docker compose -f /home/ubuntu/daytona/docker-compose.yaml exec -T db psql -U user -d daytona <<SQL_EOF
INSERT INTO snapshot (name, state, "internalName", "imageName", "organizationId")
VALUES ('ubuntu-node20', 'active', 'registry:6000/daytona/ubuntu-node20:amd64', 'ubuntu-node20', '$ORG_ID');
SQL_EOF

# Install auto-stop monitoring service (will be created by Terraform)
echo "Setup completed successfully!"
echo "Daytona API Key: $API_KEY"
echo "Organization ID: $ORG_ID"

# Create status file
cat > /home/ubuntu/daytona-status.json <<STATUS_EOF
{
  "setup_completed": "$(date -Iseconds)",
  "api_key": "$API_KEY",
  "organization_id": "$ORG_ID",
  "daytona_api_url": "http://localhost:3000/api",
  "backend_port": 3001
}
STATUS_EOF

chown ubuntu:ubuntu /home/ubuntu/daytona-status.json

echo "==================================="
echo "Daytona Instance Setup Completed"
echo "==================================="
