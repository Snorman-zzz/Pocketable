#!/bin/bash
# Stop Daytona Development Environment
# Manually stops the EC2 instance to save costs

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

# Get instance ID and region from Terraform output
INSTANCE_ID=$(cd "$TF_DIR" && terraform output -raw instance_id 2>/dev/null)
AWS_REGION=$(cd "$TF_DIR" && terraform output -json 2>/dev/null | jq -r '.instance_public_ip.value' | xargs -I {} aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text 2>/dev/null | sed 's/[a-z]$//')

if [ -z "$INSTANCE_ID" ]; then
    echo -e "${RED}✗ Could not get instance ID from Terraform${NC}"
    exit 1
fi

# Default to us-east-1 if region detection fails
AWS_REGION=${AWS_REGION:-us-east-1}

echo "======================================"
echo "Stopping Daytona Development Environment"
echo "======================================"
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Region: $AWS_REGION"
echo ""

# Check current state
echo -e "${YELLOW}➜ Checking instance state...${NC}"
CURRENT_STATE=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null)

if [ -z "$CURRENT_STATE" ]; then
    echo -e "${RED}✗ Could not determine instance state${NC}"
    exit 1
fi

echo "Current state: $CURRENT_STATE"
echo ""

if [ "$CURRENT_STATE" = "stopped" ]; then
    echo -e "${GREEN}✓ Instance is already stopped${NC}"
    echo ""
    echo "💰 Cost savings active!"
    echo "   You are only paying for EBS storage (~\$10/month)"
    echo ""
    echo "To start again, run: ./scripts/start-dev.sh"
    exit 0
fi

if [ "$CURRENT_STATE" != "running" ]; then
    echo -e "${YELLOW}⚠ Instance is in '$CURRENT_STATE' state${NC}"
    echo "Cannot stop instance in this state. Please wait or check AWS console."
    exit 1
fi

# Confirm before stopping
read -p "Are you sure you want to stop the instance? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Canceled."
    exit 0
fi

# Stop the instance
echo ""
echo -e "${YELLOW}➜ Stopping instance...${NC}"

aws ec2 stop-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Stop initiated successfully${NC}"
    echo ""
    echo "The instance will shut down in a few moments."
    echo ""
    echo "💰 Cost savings active!"
    echo "   While stopped, you only pay for EBS storage (~\$10/month)"
    echo "   vs running costs (~\$120/month for t3.xlarge)"
    echo ""
    echo "To start again, run: ./scripts/start-dev.sh"
    echo ""
else
    echo -e "${RED}✗ Failed to stop instance${NC}"
    echo "Check AWS CLI configuration and permissions."
    exit 1
fi
