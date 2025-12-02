#!/bin/bash
# Start Daytona Development Environment
# Calls Lambda auto-start function and waits for services to be ready

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load Terraform outputs
TF_DIR="$PROJECT_ROOT/terraform/environments/daytona-dev"

if [ ! -f "$TF_DIR/terraform.tfstate" ]; then
    echo -e "${RED}✗ Terraform state not found. Have you run 'terraform apply' yet?${NC}"
    echo "Run: cd $TF_DIR && terraform apply"
    exit 1
fi

# Get API endpoint from Terraform output
AUTO_START_ENDPOINT=$(cd "$TF_DIR" && terraform output -raw auto_start_api_endpoint 2>/dev/null)

if [ -z "$AUTO_START_ENDPOINT" ]; then
    echo -e "${RED}✗ Could not get auto-start endpoint from Terraform${NC}"
    exit 1
fi

echo "======================================"
echo "Starting Daytona Development Environment"
echo "======================================"
echo ""

# Call Lambda auto-start endpoint
echo -e "${YELLOW}➜ Calling auto-start endpoint...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$AUTO_START_ENDPOINT")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ne 200 ]; then
    echo -e "${RED}✗ Auto-start failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
fi

# Parse response
STATUS=$(echo "$BODY" | jq -r '.status')
MESSAGE=$(echo "$BODY" | jq -r '.message')

echo -e "${GREEN}✓ Response: $MESSAGE${NC}"
echo ""

# Handle different statuses
if [ "$STATUS" = "ready" ]; then
    DAYTONA_URL=$(echo "$BODY" | jq -r '.daytona_api_url')
    BACKEND_URL=$(echo "$BODY" | jq -r '.backend_url')

    echo -e "${GREEN}✓ Services are ready!${NC}"
    echo ""
    echo "  Daytona API:  $DAYTONA_URL"
    echo "  Backend API:  $BACKEND_URL"
    echo ""
    echo "You can now start development:"
    echo "  cd $PROJECT_ROOT/backend && npm run dev"
    echo "  cd $PROJECT_ROOT/mobile && npm start"
    echo ""

elif [ "$STATUS" = "starting" ] || [ "$STATUS" = "transitioning" ]; then
    WAIT_SECONDS=$(echo "$BODY" | jq -r '.wait_seconds // 30')

    echo -e "${YELLOW}⏳ Services are starting up...${NC}"
    echo "This may take up to 2-3 minutes for a cold start."
    echo ""
    echo "Waiting ${WAIT_SECONDS} seconds before checking again..."

    # Wait and retry
    sleep "$WAIT_SECONDS"

    echo ""
    echo "Checking again..."
    exec "$0"  # Recursive call to check status again

else
    echo -e "${RED}✗ Unexpected status: $STATUS${NC}"
    echo "$BODY" | jq '.'
    exit 1
fi
