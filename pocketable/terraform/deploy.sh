#!/bin/bash

# Automated Deployment Script for Pocketable
# This script handles the complete deployment process

set -e

echo "🚀 Pocketable AWS Deployment Script"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-east-1"
TERRAFORM_DIR="environments/production"
BACKEND_DIR="../backend"

# Step 1: Check Prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Step 2: Initialize Terraform
echo -e "${YELLOW}Step 2: Initializing Terraform...${NC}"
cd $TERRAFORM_DIR
terraform init
echo -e "${GREEN}✅ Terraform initialized${NC}"
echo ""

# Step 3: Plan Infrastructure
echo -e "${YELLOW}Step 3: Planning infrastructure changes...${NC}"
terraform plan -out=tfplan
echo -e "${GREEN}✅ Plan created${NC}"
echo ""

# Step 4: Confirm Deployment
echo -e "${YELLOW}Step 4: Ready to deploy infrastructure${NC}"
read -p "Do you want to apply these changes? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 5: Apply Terraform
echo -e "${YELLOW}Step 5: Deploying infrastructure (this may take 15-20 minutes)...${NC}"
terraform apply tfplan
echo -e "${GREEN}✅ Infrastructure deployed${NC}"
echo ""

# Step 6: Get Outputs
echo -e "${YELLOW}Step 6: Retrieving deployment information...${NC}"
ECR_REPO=$(terraform output -raw ecr_repository_url)
CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
SERVICE_NAME=$(terraform output -raw ecs_service_name)
ALB_URL=$(terraform output -raw load_balancer_url)

echo "  ECR Repository: $ECR_REPO"
echo "  ECS Cluster: $CLUSTER_NAME"
echo "  ECS Service: $SERVICE_NAME"
echo "  Application URL: $ALB_URL"
echo ""

# Step 7: Build Docker Image
echo -e "${YELLOW}Step 7: Building Docker image...${NC}"
cd $BACKEND_DIR
docker build -t pocketable-backend:latest .
echo -e "${GREEN}✅ Docker image built${NC}"
echo ""

# Step 8: Push to ECR
echo -e "${YELLOW}Step 8: Pushing Docker image to ECR...${NC}"

# Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag pocketable-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
echo -e "${GREEN}✅ Docker image pushed to ECR${NC}"
echo ""

# Step 9: Deploy to ECS
echo -e "${YELLOW}Step 9: Deploying application to ECS...${NC}"
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --force-new-deployment \
  --region $AWS_REGION \
  > /dev/null

echo -e "${GREEN}✅ Application deployment initiated${NC}"
echo ""

# Step 10: Wait for deployment
echo -e "${YELLOW}Step 10: Waiting for deployment to complete...${NC}"
echo "This may take 3-5 minutes..."

aws ecs wait services-stable \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --region $AWS_REGION

echo -e "${GREEN}✅ Deployment complete${NC}"
echo ""

# Step 11: Test Health Endpoint
echo -e "${YELLOW}Step 11: Testing application health...${NC}"
sleep 10  # Wait for load balancer to route traffic

if curl -s -f $ALB_URL/health > /dev/null; then
    echo -e "${GREEN}✅ Application is healthy${NC}"
else
    echo -e "${RED}⚠️  Application health check failed. Check CloudWatch logs.${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Application URL: $ALB_URL"
echo ""
echo "Useful commands:"
echo "  View logs: aws logs tail /ecs/pocketable-production --follow --region $AWS_REGION"
echo "  Check service: aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION"
echo ""
echo "Next steps:"
echo "  1. Test your application: curl $ALB_URL/health"
echo "  2. Monitor CloudWatch logs for any issues"
echo "  3. Update DNS to point to: $(terraform output -raw load_balancer_dns)"
echo ""
