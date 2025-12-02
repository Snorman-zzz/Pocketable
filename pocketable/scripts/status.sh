#!/bin/bash
# Check Daytona Development Environment Status
# Shows instance state, costs, and service health

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

# Get info from Terraform
INSTANCE_ID=$(cd "$TF_DIR" && terraform output -raw instance_id 2>/dev/null)
PUBLIC_IP=$(cd "$TF_DIR" && terraform output -raw instance_public_ip 2>/dev/null)
DAYTONA_URL=$(cd "$TF_DIR" && terraform output -raw daytona_api_url 2>/dev/null)
BACKEND_URL=$(cd "$TF_DIR" && terraform output -raw backend_url 2>/dev/null)

if [ -z "$INSTANCE_ID" ]; then
    echo -e "${RED}✗ Could not get instance info from Terraform${NC}"
    exit 1
fi

# Get AWS region
AWS_REGION=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' \
    --output text 2>/dev/null | sed 's/[a-z]$//')
AWS_REGION=${AWS_REGION:-us-east-1}

echo "======================================"
echo "Daytona Development Environment Status"
echo "======================================"
echo ""

# Get instance details
INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --output json 2>/dev/null)

if [ -z "$INSTANCE_INFO" ]; then
    echo -e "${RED}✗ Could not fetch instance information${NC}"
    exit 1
fi

STATE=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].State.Name')
INSTANCE_TYPE=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].InstanceType')
LAUNCH_TIME=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].LaunchTime')

# Display instance info
echo -e "${BLUE}Instance Information:${NC}"
echo "  ID:           $INSTANCE_ID"
echo "  Type:         $INSTANCE_TYPE"
echo "  Region:       $AWS_REGION"
echo "  Public IP:    $PUBLIC_IP"
echo ""

# Display state with color
echo -e "${BLUE}Current State:${NC}"
case "$STATE" in
    "running")
        echo -e "  ${GREEN}● Running${NC}"
        ;;
    "stopped")
        echo -e "  ${RED}● Stopped${NC}"
        ;;
    "pending")
        echo -e "  ${YELLOW}● Starting${NC}"
        ;;
    "stopping")
        echo -e "  ${YELLOW}● Stopping${NC}"
        ;;
    *)
        echo -e "  ${YELLOW}● $STATE${NC}"
        ;;
esac
echo ""

# If running, check service health
if [ "$STATE" = "running" ]; then
    echo -e "${BLUE}Service Health:${NC}"

    # Check Daytona API
    if curl -s --connect-timeout 5 "$DAYTONA_URL" > /dev/null 2>&1; then
        echo -e "  Daytona API:  ${GREEN}✓ Running${NC} ($DAYTONA_URL)"
    else
        echo -e "  Daytona API:  ${RED}✗ Not responding${NC} ($DAYTONA_URL)"
    fi

    # Check Backend API
    if curl -s --connect-timeout 5 "$BACKEND_URL/health" > /dev/null 2>&1; then
        echo -e "  Backend API:  ${GREEN}✓ Running${NC} ($BACKEND_URL)"
    else
        echo -e "  Backend API:  ${YELLOW}⚠ Not responding${NC} ($BACKEND_URL)"
        echo "    (Backend may not be started yet. SSH in and run: cd ~/backend && npm run dev)"
    fi
    echo ""

    # Calculate uptime
    if [ -n "$LAUNCH_TIME" ] && [ "$LAUNCH_TIME" != "null" ]; then
        LAUNCH_TIMESTAMP=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${LAUNCH_TIME:0:19}" +%s 2>/dev/null || date -d "${LAUNCH_TIME:0:19}" +%s 2>/dev/null)
        CURRENT_TIMESTAMP=$(date +%s)
        UPTIME_SECONDS=$((CURRENT_TIMESTAMP - LAUNCH_TIMESTAMP))
        UPTIME_HOURS=$((UPTIME_SECONDS / 3600))
        UPTIME_MINUTES=$(((UPTIME_SECONDS % 3600) / 60))

        echo -e "${BLUE}Uptime:${NC}"
        echo "  ${UPTIME_HOURS}h ${UPTIME_MINUTES}m"
        echo ""
    fi
fi

# Cost estimation
echo -e "${BLUE}Cost Estimation (t3.xlarge):${NC}"
if [ "$STATE" = "running" ]; then
    HOURLY_COST=0.1664
    echo "  Hourly rate:  \$${HOURLY_COST}/hour"
    echo "  Daily (24h):  \$$(printf '%.2f' $(echo "$HOURLY_COST * 24" | bc))/day"
    echo "  Monthly:      \$$(printf '%.2f' $(echo "$HOURLY_COST * 720" | bc))/month (if always on)"
    echo ""
    echo -e "  ${YELLOW}💡 Tip: Run ./scripts/stop-dev.sh when not in use to save costs${NC}"
else
    echo "  Current cost: \$0/hour (stopped)"
    echo "  Storage cost: ~\$10/month (EBS volume)"
    echo ""
    echo -e "  ${GREEN}💰 Cost savings active!${NC}"
fi
echo ""

# Quick actions
echo -e "${BLUE}Quick Actions:${NC}"
if [ "$STATE" = "running" ]; then
    echo "  Stop instance:     ./scripts/stop-dev.sh"
    echo "  SSH to instance:   ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@$PUBLIC_IP"
    echo "  View Daytona logs: ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@$PUBLIC_IP 'cd ~/daytona && docker compose logs -f'"
elif [ "$STATE" = "stopped" ]; then
    echo "  Start instance:    ./scripts/start-dev.sh"
else
    echo "  Check status:      ./scripts/status.sh"
fi
echo ""
