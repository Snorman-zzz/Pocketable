#!/bin/bash
#
# setup-daytona-snapshot.sh
# One-time setup script for cloud deployment
# Creates the ubuntu-node20 snapshot with Node.js pre-installed
#
# Usage: bash scripts/setup-daytona-snapshot.sh
#

set -e  # Exit on error

echo "=================================================="
echo "Daytona Snapshot Setup (Automated)"
echo "=================================================="
echo ""

# Check if Dockerfile exists
if [ ! -f "Dockerfile.ubuntu-node20" ]; then
  echo "❌ Error: Dockerfile.ubuntu-node20 not found in current directory"
  echo "   Please run this script from the project root."
  exit 1
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo "❌ Error: docker not found"
  echo "   Please install Docker first."
  exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
  echo "❌ Error: node not found"
  echo "   Please install Node.js first."
  exit 1
fi

# Step 1: Build Docker image with Node.js pre-installed
echo "📦 Step 1: Building Docker image ubuntu-node20:1.0..."
echo ""
docker build -f Dockerfile.ubuntu-node20 -t ubuntu-node20:1.0 .

echo ""
echo "✅ Docker image built successfully"
echo ""

# Step 2: Register snapshot with Daytona via SDK
echo "📦 Step 2: Registering snapshot with Daytona..."
echo ""
node scripts/create-snapshot.js

# Note: create-snapshot.js handles success/error messages and exit codes
