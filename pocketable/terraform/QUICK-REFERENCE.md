# Pocketable AWS - Quick Reference

## 🚀 Deploy Commands

### One-Click Deploy
```bash
cd /Users/yuan/Documents/project/pocketable/terraform
./deploy.sh
```

### Manual Deploy
```bash
cd /Users/yuan/Documents/project/pocketable/terraform/environments/production
terraform init
terraform apply
```

## 📊 Get Info

```bash
cd terraform/environments/production

# Get application URL
terraform output load_balancer_url

# Get all outputs
terraform output

# Get specific output
terraform output ecr_repository_url
```

## 🔄 Update Application

```bash
# 1. Get ECR repository URL
cd terraform/environments/production
ECR_REPO=$(terraform output -raw ecr_repository_url)

# 2. Build Docker image
cd ../../../backend
docker build -t pocketable-backend:latest .

# 3. Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO
docker tag pocketable-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# 4. Force new deployment
CLUSTER=$(cd ../terraform/environments/production && terraform output -raw ecs_cluster_name)
SERVICE=$(cd ../terraform/environments/production && terraform output -raw ecs_service_name)
aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --region us-east-1
```

## 📝 View Logs

```bash
# Real-time logs
aws logs tail /ecs/pocketable-production --follow --region us-east-1

# Last 1 hour
aws logs tail /ecs/pocketable-production --since 1h --region us-east-1

# Search logs
aws logs filter-log-events --log-group-name /ecs/pocketable-production --filter-pattern "ERROR"
```

## 🎛️ Scale Service

```bash
# Scale to 5 tasks
aws ecs update-service \
  --cluster production-pocketable-production \
  --service pocketable-backend \
  --desired-count 5 \
  --region us-east-1

# Scale to 0 (stop all tasks)
aws ecs update-service \
  --cluster production-pocketable-production \
  --service pocketable-backend \
  --desired-count 0 \
  --region us-east-1
```

## 🔍 Check Status

```bash
# ECS service status
aws ecs describe-services \
  --cluster production-pocketable-production \
  --services pocketable-backend \
  --region us-east-1

# Running tasks
aws ecs list-tasks \
  --cluster production-pocketable-production \
  --service-name pocketable-backend \
  --region us-east-1

# Target group health
aws elbv2 describe-target-health \
  --target-group-arn <arn-from-terraform-output> \
  --region us-east-1
```

## 🗄️ Database

```bash
# Get database endpoint
cd terraform/environments/production
terraform output database_endpoint

# Get database password
aws secretsmanager get-secret-value \
  --secret-id production/pocketable/database-password \
  --region us-east-1 \
  --query SecretString \
  --output text
```

## 📊 Monitoring

```bash
# List CloudWatch alarms
aws cloudwatch describe-alarms --region us-east-1

# Get metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=pocketable-backend \
  --start-time 2025-01-10T00:00:00Z \
  --end-time 2025-01-10T23:59:59Z \
  --period 3600 \
  --statistics Average \
  --region us-east-1
```

## 🧹 Cleanup

```bash
# Destroy everything
cd terraform/environments/production
terraform destroy

# Force destroy (skip confirmation)
terraform destroy -auto-approve
```

## 🆘 Troubleshooting

### ECS Task Won't Start
```bash
# Check service events
aws ecs describe-services \
  --cluster production-pocketable-production \
  --services pocketable-backend \
  --region us-east-1 \
  --query 'services[0].events[0:5]'

# Check task definition
aws ecs describe-task-definition \
  --task-definition production-pocketable-backend \
  --region us-east-1
```

### Can't Access Application
```bash
# Check ALB
aws elbv2 describe-load-balancers --region us-east-1

# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <arn> \
  --region us-east-1
```

### High Costs
```bash
# Stop all tasks (cost = $0)
aws ecs update-service \
  --cluster production-pocketable-production \
  --service pocketable-backend \
  --desired-count 0 \
  --region us-east-1

# Check what's running
aws ecs list-tasks \
  --cluster production-pocketable-production \
  --region us-east-1
```

## 💰 Cost Management

```bash
# View current month costs
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --region us-east-1

# Set up billing alarm (one-time)
aws cloudwatch put-metric-alarm \
  --alarm-name pocketable-billing-alarm \
  --alarm-description "Alert when monthly cost exceeds $100" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --region us-east-1
```

## 🔐 Security

```bash
# Rotate API keys
aws secretsmanager update-secret \
  --secret-id production/pocketable/anthropic-api-key \
  --secret-string "new-key-here" \
  --region us-east-1

# Then force new deployment to pick up new secrets
aws ecs update-service \
  --cluster production-pocketable-production \
  --service pocketable-backend \
  --force-new-deployment \
  --region us-east-1
```

## 📦 Useful AWS Console Links

- **ECS Services:** https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters
- **CloudWatch Logs:** https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups
- **RDS Databases:** https://console.aws.amazon.com/rds/home?region=us-east-1#databases:
- **Load Balancers:** https://console.aws.amazon.com/ec2/home?region=us-east-1#LoadBalancers:
- **Cost Explorer:** https://console.aws.amazon.com/cost-management/home

## 🔗 Quick Links

- **Main Docs:** [DEPLOY.md](DEPLOY.md)
- **Overview:** [README.md](README.md)
- **Summary:** [DEPLOYMENT-SUMMARY.md](../DEPLOYMENT-SUMMARY.md)

---

**Pro Tip:** Bookmark this file for quick command reference!
