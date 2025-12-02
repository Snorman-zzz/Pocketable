# Pocketable Terraform Infrastructure

Infrastructure as Code (IaC) for deploying Pocketable to AWS with two environments:
- **Production:** ECS Fargate backend with auto-scaling
- **Daytona Dev:** Cost-optimized self-hosted Daytona environment

## 📚 Environments

### 1. Daytona Dev (`environments/daytona-dev/`)

Cost-optimized development environment with self-hosted Daytona:

**Features:**
- EC2 t3.xlarge with Docker & Daytona (13 containers)
- Lambda auto-start function (~2 min cold start)
- Auto-stop after 2 hours idle (saves 87% costs)
- ubuntu-node20 snapshot pre-installed (eliminates Node.js reinstall time)
- EBS volume for persistent data
- Elastic IP for stable endpoint

**Monthly Cost:**
- Stop/start model (40 hrs dev): **~$17-20/month** ✅
- Always-on: ~$130-140/month

**Quick Start:**
```bash
cd environments/daytona-dev
terraform init && terraform apply
cd ../../..
./scripts/start-dev.sh
```

See [AWS-DEPLOYMENT.md](../AWS-DEPLOYMENT.md) for detailed guide.

### 2. Production (`environments/production/`)

Full production deployment with ECS Fargate:

## 🏗️ Production Architecture

**Production-Ready Minimal** (~$100-150/month)

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  Application Load Balancer  │
         │    (Public Subnets)         │
         └─────────────┬───────────────┘
                       │
         ┌─────────────▼───────────────┐
         │  ECS Fargate Auto-Scaling   │
         │    (Private Subnets)        │
         │    Min: 1, Max: 10 tasks    │
         └─┬───────────────────────┬───┘
           │                       │
     ┌─────▼──────┐         ┌─────▼──────┐
     │  RDS        │         │ ElastiCache│
     │  PostgreSQL │         │   Redis    │
     │ (t3.micro)  │         │ (t3.micro) │
     └────────────┘          └────────────┘
```

### Components

✅ **VPC & Networking**
- VPC with public/private subnets across 2 AZs
- NAT Gateways for private subnet internet access
- Security Groups (ALB, ECS, RDS, Redis)

✅ **Compute (Auto-Scaling)**
- ECS Fargate cluster
- Auto-scaling: 1-10 tasks based on CPU/memory
- Health checks and automatic recovery

✅ **Database**
- RDS PostgreSQL 15.4 (db.t3.micro)
- Automated backups (7 days retention)
- Encrypted storage
- Private subnet (not publicly accessible)

✅ **Cache**
- ElastiCache Redis 7.0 (cache.t3.micro)
- For Socket.io session state
- Private subnet

✅ **Load Balancer**
- Application Load Balancer
- Health checks on `/health` endpoint
- HTTP traffic (HTTPS can be added later)

✅ **Monitoring**
- CloudWatch Logs
- CloudWatch Alarms (CPU, Memory)
- Container Insights

✅ **Security**
- AWS Secrets Manager for API keys
- Encrypted RDS storage
- Private subnets for database/cache
- IAM roles with least-privilege

## 🚀 Quick Start

### Prerequisites

- AWS CLI configured
- Terraform >= 1.0
- Docker installed

### Deploy Everything (Automated)

```bash
cd /Users/yuan/Documents/project/pocketable/terraform
./deploy.sh
```

This script will:
1. ✅ Initialize Terraform
2. ✅ Deploy infrastructure (~15 minutes)
3. ✅ Build Docker image
4. ✅ Push to ECR
5. ✅ Deploy to ECS
6. ✅ Run health checks

### Manual Deployment

See [DEPLOY.md](DEPLOY.md) for detailed step-by-step instructions.

## 📁 Project Structure

```
terraform/
├── deploy.sh                           # Automated deployment script (production)
├── DEPLOY.md                           # Production deployment guide
├── README.md                           # This file
├── environments/
│   ├── daytona-dev/                   # Development environment
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars.example
│   └── production/                     # Production environment
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── terraform.tfvars
│       └── terraform.tfvars.example
└── modules/
    ├── networking/                     # VPC, subnets, security groups
    ├── database/                       # RDS PostgreSQL
    ├── cache/                          # ElastiCache Redis
    ├── compute/                        # ECS Fargate + auto-scaling
    ├── loadbalancer/                   # Application Load Balancer
    ├── monitoring/                     # CloudWatch alarms
    ├── secrets/                        # AWS Secrets Manager
    ├── daytona-instance/               # EC2 for self-hosted Daytona
    └── auto-start-function/            # Lambda auto-start for Daytona
```

## 💰 Cost Breakdown

### Daytona Dev Environment

**Stop/Start Model (40 hrs/month active):**
- EC2 t3.xlarge: ~$6.66/month (40 hrs × $0.1664/hr)
- EBS Storage (100 GB): ~$10/month
- Lambda + API Gateway: ~$0.01/month
- **Total: ~$17-20/month** ✅ Recommended

**Always-On:**
- EC2 t3.xlarge: ~$120/month (720 hrs × $0.1664/hr)
- EBS Storage: ~$10/month
- Lambda: ~$0.01/month
- **Total: ~$130-140/month**

### Production Environment

**Monthly Costs:**
- ECS Fargate (1-2 tasks avg): ~$15-30
- RDS PostgreSQL t3.micro: ~$15
- ElastiCache Redis t3.micro: ~$12
- Application Load Balancer: ~$20
- NAT Gateways (2): ~$70
- Data Transfer: ~$5-10
- **Total: ~$130-150/month**

**Free Tier (First 12 months):**
- RDS: 750 hours/month free
- **Estimated Cost: ~$100/month**

### Cost Comparison

| Environment | Use Case | Monthly Cost |
|-------------|----------|--------------|
| Daytona Dev (stop/start) | Development | **$17-20** ✅ |
| Daytona Dev (always-on) | Heavy development | $130-140 |
| Production | Live app | $100-150 |

## 🔄 Common Operations

### Daytona Dev Operations

#### Start Instance
```bash
./scripts/start-dev.sh
# Cold start: ~2 minutes
# Returns when Daytona + Backend are ready
```

#### Stop Instance (Save Costs)
```bash
./scripts/stop-dev.sh
# Confirms before stopping
# Reduces cost to ~$10/month (storage only)
```

#### Check Status
```bash
./scripts/status.sh
# Shows:
# - Instance state
# - Service health
# - Uptime
# - Cost estimation
```

#### SSH to Instance
```bash
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@$(cd terraform/environments/daytona-dev && terraform output -raw instance_public_ip)
```

#### View Daytona Logs
```bash
ssh -i ~/.ssh/pocketable-daytona-dev.pem ubuntu@<instance-ip>
cd ~/daytona
docker compose logs -f
```

### Production Operations

#### Update Application Code

```bash
cd /Users/yuan/Documents/project/pocketable

# 1. Build new image
cd backend
ECR_REPO=$(cd ../terraform/environments/production && terraform output -raw ecr_repository_url)
docker build -t pocketable-backend:latest .

# 2. Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO
docker tag pocketable-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# 3. Deploy to ECS
CLUSTER=$(cd ../terraform/environments/production && terraform output -raw ecs_cluster_name)
SERVICE=$(cd ../terraform/environments/production && terraform output -raw ecs_service_name)
aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --region us-east-1
```

### View Logs

```bash
cd terraform/environments/production
aws logs tail $(terraform output -raw cloudwatch_log_group) --follow --region us-east-1
```

### Scale Service

```bash
# Scale to 5 tasks
aws ecs update-service --cluster <cluster-name> --service <service-name> --desired-count 5 --region us-east-1
```

### Access Database

```bash
# Get credentials from Secrets Manager
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id production/pocketable/database-password \
  --region us-east-1 \
  --query SecretString \
  --output text)

# Database is in private subnet - use bastion host or ECS Exec
```

## 🌍 Cloud-Agnostic Design

The infrastructure is designed to be portable across cloud providers:

### Current: AWS
- ECS Fargate → Google Cloud Run / Azure Container Apps
- RDS PostgreSQL → Cloud SQL / Azure Database
- ElastiCache Redis → Memorystore / Azure Cache

### Migration to GCP/Azure

```bash
# Future: Copy modules and adapt
cp -r terraform/modules terraform/modules-gcp
# Update provider from AWS to GCP/Azure
# Resource names remain similar
```

## 🔒 Security Best Practices

✅ **Network Isolation**
- Database in private subnet
- Redis in private subnet
- ECS tasks in private subnet
- Only ALB is public-facing

✅ **Secrets Management**
- API keys in AWS Secrets Manager
- No hardcoded credentials
- Encrypted at rest

✅ **Access Control**
- Security groups with least-privilege
- IAM roles for ECS tasks
- No SSH access needed

✅ **Encryption**
- RDS storage encrypted
- Secrets Manager encrypted
- HTTPS for ALB (add SSL certificate)

## 📊 Monitoring & Alerts

CloudWatch Alarms trigger when:
- CPU utilization > 80%
- Memory utilization > 85%
- Service becomes unhealthy

View metrics:
```bash
# AWS Console → CloudWatch → Alarms
# OR
aws cloudwatch describe-alarms --region us-east-1
```

## 🧪 Testing

Test the deployment:
```bash
# Get URL
cd terraform/environments/production
ALB_URL=$(terraform output -raw load_balancer_url)

# Test health endpoint
curl $ALB_URL/health

# Expected response:
# {"status":"ok","timestamp":"...","daytona":true,"anthropic":true,"openai":true,"database":true}
```

## 🗑️ Cleanup

**WARNING:** This deletes ALL resources and data!

```bash
cd terraform/environments/production
terraform destroy
```

A final RDS snapshot will be created automatically (production only).

## 📚 Documentation

- [DEPLOY.md](DEPLOY.md) - Detailed deployment guide
- [AWS ECS Docs](https://docs.aws.amazon.com/ecs/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

## 🆘 Troubleshooting

### ECS tasks not starting
```bash
# Check service events
aws ecs describe-services --cluster <cluster> --services <service> --region us-east-1

# Check logs
aws logs tail /ecs/pocketable-production --follow --region us-east-1
```

### Can't access application
```bash
# Check target group health
aws elbv2 describe-target-health --target-group-arn <arn> --region us-east-1
```

### Database connection issues
- Ensure RDS is in private subnet
- Check security group allows ECS → RDS on port 5432
- Verify connection string in environment variables

## 🔮 Future Enhancements

- [ ] Add HTTPS with ACM SSL certificate
- [ ] Configure Route53 for custom domain
- [ ] Add multi-region deployment
- [ ] Implement blue/green deployments
- [ ] Add bastion host for database access
- [ ] Configure VPN for private access
- [ ] Add WAF for DDoS protection
- [ ] Implement cost optimization with Fargate Spot

## 📝 Notes

- Infrastructure is deployed in `us-east-1`
- Database backups retained for 7 days
- Auto-scaling targets: 70% CPU, 80% memory
- Health checks run every 30 seconds
- Container logs retained for 7 days

---

**Built with ❤️ using Terraform & AWS**
