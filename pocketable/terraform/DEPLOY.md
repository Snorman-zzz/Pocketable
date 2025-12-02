# Pocketable AWS Deployment Guide

## 🚀 Quick Start Deployment

### Prerequisites
1. ✅ AWS CLI installed and configured with your credentials
2. ✅ Terraform installed (v1.0+)
3. ✅ Docker installed

### Step-by-Step Deployment

#### 1. Configure AWS CLI
```bash
aws configure
# Enter your Access Key ID: AKIAWETWJSTKX2ZPUKWZ
# Enter your Secret Access Key: (provided)
# Default region: us-east-1
# Default output format: json
```

#### 2. Navigate to Terraform directory
```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/production
```

#### 3. Initialize Terraform
```bash
terraform init
```

#### 4. Review the deployment plan
```bash
terraform plan
```

Expected resources to be created:
- ✅ VPC with public/private subnets across 2 AZs
- ✅ NAT Gateways for private subnet internet access
- ✅ Security Groups (ALB, ECS, RDS, Redis)
- ✅ RDS PostgreSQL database (db.t3.micro)
- ✅ ElastiCache Redis (cache.t3.micro)
- ✅ Application Load Balancer
- ✅ ECS Fargate cluster with auto-scaling (1-10 tasks)
- ✅ ECR repository for Docker images
- ✅ CloudWatch logs and alarms
- ✅ Secrets Manager for API keys

#### 5. Apply Terraform configuration
```bash
terraform apply
```

Type `yes` when prompted.

⏱️ **Estimated time:** 15-20 minutes

#### 6. Build and Push Docker Image

After Terraform completes, you'll see the ECR repository URL in the outputs.

```bash
# Get ECR repository URL
ECR_REPO=$(terraform output -raw ecr_repository_url)

# Navigate to backend directory
cd /Users/yuan/Documents/project/pocketable/backend

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO

# Build Docker image
docker build -t pocketable-backend:latest .

# Tag image for ECR
docker tag pocketable-backend:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest
```

#### 7. Deploy to ECS

The ECS service will automatically pull the latest image from ECR.

```bash
# Get cluster and service names
CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
SERVICE_NAME=$(terraform output -raw ecs_service_name)

# Force new deployment
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --force-new-deployment \
  --region us-east-1
```

#### 8. Get Application URL

```bash
terraform output load_balancer_url
```

Example output: `http://production-pocketable-alb-1234567890.us-east-1.elb.amazonaws.com`

Test the deployment:
```bash
curl http://<YOUR_ALB_URL>/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-10T...",
  "daytona": true,
  "anthropic": true,
  "openai": true,
  "database": true
}
```

---

## 📊 Architecture Overview

```
Internet
   ↓
Application Load Balancer (Public Subnets)
   ↓
ECS Fargate Tasks (Private Subnets)
   ↓
RDS PostgreSQL (Private Subnets)
   ↓
ElastiCache Redis (Private Subnets)
```

**Auto-Scaling:**
- Minimum: 1 ECS task
- Maximum: 10 ECS tasks
- Scale up trigger: >70% CPU or >80% memory
- Scale down trigger: <50% CPU and <60% memory

**Cost Estimate (Monthly):**
- ECS Fargate (1-2 tasks avg): ~$15-30
- RDS PostgreSQL t3.micro: ~$15
- ElastiCache Redis t3.micro: ~$12
- Application Load Balancer: ~$20
- NAT Gateways (2): ~$70
- **Total: ~$130-150/month**

**Free Tier Eligible (First 12 months):**
- RDS PostgreSQL: 750 hours/month
- Actual cost first year: ~$100/month

---

## 🔄 Updating the Application

### Deploy New Code

```bash
# 1. Navigate to backend directory
cd /Users/yuan/Documents/project/pocketable/backend

# 2. Make your code changes
# ... edit files ...

# 3. Build new Docker image
ECR_REPO=$(cd ../../terraform/environments/production && terraform output -raw ecr_repository_url)
docker build -t pocketable-backend:latest .

# 4. Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO
docker tag pocketable-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# 5. Deploy to ECS
CLUSTER_NAME=$(cd ../../terraform/environments/production && terraform output -raw ecs_cluster_name)
SERVICE_NAME=$(cd ../../terraform/environments/production && terraform output -raw ecs_service_name)

aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --force-new-deployment \
  --region us-east-1

# 6. Monitor deployment
aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region us-east-1 \
  --query 'services[0].deployments'
```

---

## 📝 Viewing Logs

### CloudWatch Logs

```bash
# Get log group name
LOG_GROUP=$(cd /Users/yuan/Documents/project/pocketable/terraform/environments/production && terraform output -raw cloudwatch_log_group)

# View recent logs
aws logs tail $LOG_GROUP --follow --region us-east-1
```

### Via AWS Console

1. Go to AWS Console → CloudWatch → Log Groups
2. Find `/ecs/pocketable-production`
3. Click on log stream to view

---

## 🗄️ Database Access

### Connect to RDS PostgreSQL

```bash
# Get database endpoint (from Terraform outputs)
cd /Users/yuan/Documents/project/pocketable/terraform/environments/production
DB_ENDPOINT=$(terraform output -raw database_endpoint)

# Get database password from Secrets Manager
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id production/pocketable/database-password \
  --region us-east-1 \
  --query SecretString \
  --output text)

# Connect using psql (you'll need to SSH into ECS task or use bastion host)
# Note: Database is in private subnet, not publicly accessible
```

**Important:** The database is NOT publicly accessible for security. To connect:
1. Use AWS Systems Manager Session Manager
2. Create a bastion host in public subnet
3. Use ECS Exec to connect to running task

---

## 🔒 Security Notes

✅ **Database** is in private subnet (not publicly accessible)
✅ **Redis** is in private subnet (not publicly accessible)
✅ **API Keys** stored in AWS Secrets Manager (encrypted)
✅ **RDS** storage encrypted at rest
✅ **Security Groups** follow least-privilege principle
✅ **ECS tasks** run as non-root user

---

## 💰 Cost Optimization

### Reduce Costs

1. **Use Fargate Spot for non-production:**
   - Edit `modules/compute/main.tf`
   - Add `capacity_provider_strategy` with `FARGATE_SPOT`
   - Saves ~70% on compute costs

2. **Reduce NAT Gateway costs:**
   - Use single NAT Gateway instead of 2 (~$35/month savings)
   - Edit `modules/networking/main.tf` and set `count = 1`

3. **Use RDS t4g.micro (ARM-based):**
   - ~20% cheaper than t3.micro
   - Edit `modules/database/variables.tf`

4. **Stop dev environments when not in use:**
   - Scale ECS service to 0: `aws ecs update-service --desired-count 0`

---

## 🌍 Multi-Region Deployment (Future)

To add multi-region support later:

1. Create new environment:
```bash
cp -r terraform/environments/production terraform/environments/production-eu
```

2. Update region in `terraform.tfvars`:
```hcl
aws_region = "eu-west-1"
```

3. Deploy to new region:
```bash
cd terraform/environments/production-eu
terraform init
terraform apply
```

4. Add Route53 for geo-routing or use AWS Global Accelerator

---

## 🧹 Cleanup (Destroy Infrastructure)

⚠️ **WARNING:** This will delete ALL resources and data!

```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/production

# Destroy all resources
terraform destroy
```

Type `yes` when prompted.

**Before destroying:**
1. Backup your database if needed
2. Export any important logs
3. Note: Final RDS snapshot is created automatically (production only)

---

## 🆘 Troubleshooting

### Issue: Terraform apply fails

**Solution:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check Terraform state
terraform show

# Re-initialize
terraform init -upgrade
```

### Issue: ECS task fails to start

**Solution:**
```bash
# Check ECS service events
aws ecs describe-services --cluster <cluster-name> --services <service-name>

# Check CloudWatch logs
aws logs tail /ecs/pocketable-production --follow
```

### Issue: Can't access application

**Solution:**
```bash
# Check ALB health
terraform output load_balancer_dns

# Check target group health
aws elbv2 describe-target-health --target-group-arn <target-group-arn>
```

---

## 📞 Support

For issues with:
- **AWS Infrastructure:** Check CloudWatch logs and ECS service events
- **Application Code:** Check application logs in CloudWatch
- **Terraform:** Run `terraform validate` and `terraform plan`

---

## 📚 Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Free Tier](https://aws.amazon.com/free/)
