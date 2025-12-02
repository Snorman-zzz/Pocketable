# AWS Deployment Guide for Pocketable with Self-Hosted Daytona

This guide explains how to deploy Pocketable's self-hosted Daytona infrastructure to AWS using Terraform.

## Overview

This deployment creates:
- **EC2 t3.xlarge instance** running Docker and Daytona (4 vCPU, 16GB RAM)
- **Lambda function** for auto-start capability
- **API Gateway** endpoint to trigger auto-start
- **Auto-stop monitoring** service to reduce costs
- **EBS volume** for persistent data (100GB)
- **Elastic IP** for stable endpoint

### Cost Optimization

The infrastructure is designed for cost-effective development:

| Usage Pattern | Monthly Cost | Notes |
|--------------|--------------|-------|
| Stop/start model (40 hrs/month) | ~$17-20 | Recommended for development |
| Always-on (720 hrs/month) | ~$130-140 | For production or heavy usage |
| Storage only (stopped) | ~$10 | EBS volume when instance stopped |

**Key savings:**
- Stop instance when not in use: **87% cost reduction**
- Auto-stop after 2 hours idle: **Automatic savings**
- Cold start time: **~2 minutes** (transparent via Lambda)

## Prerequisites

### 1. Install Required Tools

```bash
# Terraform (>= 1.0)
brew install terraform

# AWS CLI
brew install awscli

# jq (for scripts)
brew install jq
```

### 2. Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# Test credentials
aws sts get-caller-identity
```

You'll need:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)

### 3. Create SSH Key Pair

```bash
# Generate SSH key for EC2 access
ssh-keygen -t rsa -b 4096 -f ~/.ssh/pocketable-daytona-dev -C "pocketable-daytona"

# Add to SSH agent
ssh-add ~/.ssh/pocketable-daytona-dev
```

## Deployment Steps

### Step 1: Configure Terraform Variables

```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/daytona-dev

# Copy example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**Required variables in `terraform.tfvars`:**

```hcl
aws_region = "us-east-1"

instance_type = "t3.xlarge"  # Required for Daytona

# Your API keys from backend/.env
anthropic_api_key = "sk-ant-api03-..."
openai_api_key    = "sk-proj-..."

# SSH configuration
ssh_key_name = "pocketable-daytona-dev"

# Security: Restrict SSH to your IP
# Get your IP: curl ifconfig.me
allowed_ssh_cidrs = ["YOUR.IP.ADDRESS/32"]
```

### Step 2: Initialize Terraform

```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/daytona-dev

# Initialize Terraform (downloads providers)
terraform init
```

### Step 3: Review Infrastructure Plan

```bash
# Preview what will be created
terraform plan
```

This will show:
- EC2 instance configuration
- Security groups
- Lambda function
- API Gateway
- Estimated costs

### Step 4: Deploy Infrastructure

```bash
# Deploy infrastructure
terraform apply

# Review changes and type 'yes' to confirm
```

**Deployment takes ~5-7 minutes:**
1. Create EC2 instance (1-2 min)
2. Install Docker and dependencies (2-3 min)
3. Start Daytona (13 containers) (1-2 min)
4. Build ubuntu-node20 snapshot (1-2 min)

### Step 5: Get Deployment Outputs

```bash
# View all outputs
terraform output

# Important outputs:
# - instance_public_ip: Elastic IP of instance
# - daytona_api_url: http://<IP>:3000/api
# - backend_url: http://<IP>:3001
# - auto_start_api_endpoint: Lambda trigger URL
# - ssh_command: SSH connection command
```

### Step 6: Get Daytona Credentials

After deployment, the instance will have created API keys. Retrieve them:

```bash
# SSH to instance
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@$(terraform output -raw instance_public_ip)

# View credentials
cat ~/daytona-status.json
```

Copy the `api_key` and `organization_id` values.

### Step 7: Configure Backend

Update your local backend `.env`:

```bash
cd /Users/yuan/Documents/project/pocketable/backend

# Create .env.aws (or edit existing .env)
cat >> .env.aws <<EOF
# AWS-Hosted Daytona Configuration
DAYTONA_API_KEY=<api_key from daytona-status.json>
DAYTONA_API_URL=<daytona_api_url from terraform output>
DAYTONA_ORGANIZATION_ID=<organization_id from daytona-status.json>
DAYTONA_TARGET=us
DAYTONA_SNAPSHOT_NAME=ubuntu-node20

# Backend server
PORT=3001

# Your existing API keys
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
EOF
```

### Step 8: Test Deployment

```bash
# Check instance status
./scripts/status.sh

# Should show:
# - Instance: Running
# - Daytona API: ✓ Running
# - Backend API: ⚠ Not responding (expected - backend not started yet)
```

## Usage

### Starting Development

```bash
# From project root
./scripts/start-dev.sh
```

This script:
1. Calls Lambda auto-start endpoint
2. Starts instance if stopped (~2 min cold start)
3. Waits for Daytona and Backend to be ready
4. Shows service URLs when ready

**Cold start sequence:**
- 0-30s: EC2 instance starting
- 30-90s: Docker containers starting
- 90-120s: Services initializing
- 120s+: Ready to use

### Stopping to Save Costs

```bash
# Stop instance when done
./scripts/stop-dev.sh
```

**What happens:**
- Instance stops (no compute charges)
- EBS volume preserved (data persists)
- Only charged for storage (~$10/month)
- Can restart anytime with `start-dev.sh`

### Checking Status

```bash
# Check instance and service status
./scripts/status.sh
```

Shows:
- Instance state (running/stopped)
- Service health (Daytona, Backend)
- Uptime
- Cost estimation
- Quick actions

## Auto-Stop Feature

The instance includes an auto-stop monitoring service that stops the instance after **2 hours of inactivity**.

### How It Works

1. Service monitors backend API activity every 5 minutes
2. If no activity for 2 hours, instance stops automatically
3. You can restart anytime with `start-dev.sh`
4. Saves costs without manual intervention

### Viewing Auto-Stop Logs

```bash
# SSH to instance
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@<instance-ip>

# View monitoring logs
sudo journalctl -u auto-stop-monitor -f

# Check last activity
cat /var/lib/daytona/last-activity.json
```

### Disabling Auto-Stop

```bash
# SSH to instance
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@<instance-ip>

# Stop and disable service
sudo systemctl stop auto-stop-monitor
sudo systemctl disable auto-stop-monitor
```

To re-enable:
```bash
sudo systemctl enable auto-stop-monitor
sudo systemctl start auto-stop-monitor
```

## Multi-Cloud Portability

The Terraform configuration is structured for easy migration to other cloud providers.

### Switching to GCP

1. Update `main.tf` provider block:
```hcl
provider "google" {
  project = "your-project-id"
  region  = "us-central1"
}
```

2. Change resources:
- `aws_instance` → `google_compute_instance`
- `aws_ebs_volume` → `google_compute_disk`
- `aws_lambda_function` → `google_cloudfunctions_function`
- `aws_apigatewayv2_api` → `google_cloud_endpoints_service`

3. Update variables for GCP naming conventions

### Switching to Azure

1. Update provider:
```hcl
provider "azurerm" {
  features {}
}
```

2. Change resources:
- `aws_instance` → `azurerm_linux_virtual_machine`
- `aws_ebs_volume` → `azurerm_managed_disk`
- `aws_lambda_function` → `azurerm_function_app`

## Troubleshooting

### Issue: Terraform Init Fails

**Solution:**
```bash
# Check Terraform version
terraform version

# Upgrade if needed
brew upgrade terraform

# Clear cache and re-init
rm -rf .terraform
terraform init
```

### Issue: SSH Connection Refused

**Possible causes:**
1. Instance not fully started yet (wait 2-3 minutes)
2. Security group doesn't allow your IP

**Solution:**
```bash
# Check instance state
./scripts/status.sh

# Update security group with your current IP
YOUR_IP=$(curl -s ifconfig.me)
cd terraform/environments/daytona-dev
terraform apply -var="allowed_ssh_cidrs=[\"$YOUR_IP/32\"]"
```

### Issue: Services Not Starting

**Check logs:**
```bash
# SSH to instance
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@<instance-ip>

# Check Docker containers
docker ps -a

# View Daytona logs
cd ~/daytona
docker compose logs -f

# Check user-data script completion
tail -f /var/log/user-data.log
```

### Issue: Lambda Auto-Start Times Out

**Possible causes:**
- Services taking longer than 3 minutes to start
- Network issues

**Solution:**
```bash
# Check instance state in AWS Console
aws ec2 describe-instances --instance-ids <instance-id>

# Manually start if needed
aws ec2 start-instances --instance-ids <instance-id>

# Wait 3-5 minutes, then check
curl http://<instance-ip>:3000/api
```

### Issue: High Costs

**Check uptime:**
```bash
./scripts/status.sh
```

**Solutions:**
1. Ensure auto-stop is enabled (default: 2 hour idle threshold)
2. Manually stop when not in use: `./scripts/stop-dev.sh`
3. Consider smaller instance type for light testing (t3.large = ~$60/month always-on)

## Cleanup

To destroy all infrastructure and stop charges:

```bash
cd terraform/environments/daytona-dev

# Preview what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy

# Type 'yes' to confirm
```

**Warning:** This will:
- Delete the EC2 instance
- Delete the EBS volume (data loss)
- Delete Lambda function and API Gateway
- Keep your Terraform state file

To preserve data, stop the instance instead of destroying it.

## Cost Monitoring

### View Current Month Costs

```bash
# Using AWS CLI
aws ce get-cost-and-usage \
    --time-period Start=$(date -v1d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity MONTHLY \
    --metrics UnblendedCost \
    --filter file://<(echo '{
        "Tags": {
            "Key": "Project",
            "Values": ["pocketable"]
        }
    }')
```

### Set Up Billing Alerts

1. Go to AWS Console → Billing → Budgets
2. Create budget: "Pocketable Monthly"
3. Set amount: $50 (or your threshold)
4. Add email alert at 80% and 100%

## Production Considerations

When moving to production:

1. **Use remote state:**
   ```hcl
   # In main.tf
   backend "s3" {
     bucket         = "pocketable-terraform-state"
     key            = "daytona-dev/terraform.tfstate"
     region         = "us-east-1"
     encrypt        = true
     dynamodb_table = "pocketable-terraform-locks"
   }
   ```

2. **Restrict SSH access:**
   ```hcl
   allowed_ssh_cidrs = ["YOUR_COMPANY_IP/32"]
   ```

3. **Enable HTTPS:**
   - Add ALB with SSL certificate
   - Use Route53 for custom domain
   - Update security groups for port 443

4. **Increase instance size:**
   ```hcl
   instance_type = "t3.2xlarge"  # 8 vCPU, 32GB RAM
   ```

5. **Enable backups:**
   - EBS snapshots (daily)
   - Database backups
   - S3 bucket for configs

6. **Monitor with CloudWatch:**
   - CPU, memory, disk usage
   - Service health checks
   - Custom metrics

## Support

For issues or questions:
1. Check Terraform docs: https://registry.terraform.io/providers/hashicorp/aws
2. Review Daytona setup: See DAYTONA-SETUP.md
3. AWS troubleshooting: Check CloudWatch logs
4. GitHub issues: https://github.com/your-repo/issues

## Next Steps

After deployment:
1. ✅ Configure backend `.env.aws` with Daytona credentials
2. ✅ Test with: `./scripts/status.sh`
3. ✅ Start development: `./scripts/start-dev.sh`
4. ✅ Develop your app as normal
5. ✅ Stop when done: `./scripts/stop-dev.sh`

Your Pocketable app will now use the AWS-hosted Daytona instance with ubuntu-node20 snapshot, eliminating Node.js installation time on every build!
