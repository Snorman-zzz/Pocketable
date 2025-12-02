#!/bin/bash

# Verification script to check if everything is ready for deployment

echo "🔍 Verifying Pocketable Deployment Setup..."
echo "==========================================="
echo ""

ERRORS=0

# Check AWS CLI
echo "Checking AWS CLI..."
if command -v aws &> /dev/null; then
    AWS_IDENTITY=$(aws sts get-caller-identity 2>&1)
    if [ $? -eq 0 ]; then
        echo "✅ AWS CLI configured correctly"
        echo "   Account: $(echo $AWS_IDENTITY | grep -o '"Account": "[^"]*' | cut -d'"' -f4)"
    else
        echo "❌ AWS CLI not configured. Run: aws configure"
        ERRORS=$((ERRORS+1))
    fi
else
    echo "❌ AWS CLI not installed"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check Terraform
echo "Checking Terraform..."
if command -v terraform &> /dev/null; then
    TF_VERSION=$(terraform version | head -n1)
    echo "✅ Terraform installed: $TF_VERSION"
else
    echo "❌ Terraform not installed"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check Docker
echo "Checking Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker installed: $DOCKER_VERSION"

    # Check if Docker daemon is running
    if docker ps &> /dev/null; then
        echo "✅ Docker daemon is running"
    else
        echo "❌ Docker daemon is not running. Start Docker Desktop."
        ERRORS=$((ERRORS+1))
    fi
else
    echo "❌ Docker not installed"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check Terraform files
echo "Checking Terraform configuration..."
if [ -f "environments/production/main.tf" ]; then
    echo "✅ main.tf exists"
else
    echo "❌ main.tf not found"
    ERRORS=$((ERRORS+1))
fi

if [ -f "environments/production/terraform.tfvars" ]; then
    echo "✅ terraform.tfvars exists (with your API keys)"
else
    echo "❌ terraform.tfvars not found. Create it from terraform.tfvars.example"
    ERRORS=$((ERRORS+1))
fi
echo ""

# Check Dockerfile
echo "Checking Docker configuration..."
if [ -f "../backend/Dockerfile" ]; then
    echo "✅ Dockerfile exists"
else
    echo "❌ Dockerfile not found"
    ERRORS=$((ERRORS+1))
fi

if [ -f "../backend/.dockerignore" ]; then
    echo "✅ .dockerignore exists"
else
    echo "⚠️  .dockerignore not found (optional but recommended)"
fi
echo ""

# Check modules
echo "Checking Terraform modules..."
MODULES=("networking" "database" "cache" "compute" "loadbalancer" "monitoring" "secrets")
for module in "${MODULES[@]}"; do
    if [ -d "modules/$module" ]; then
        echo "✅ Module $module exists"
    else
        echo "❌ Module $module not found"
        ERRORS=$((ERRORS+1))
    fi
done
echo ""

# Summary
echo "==========================================="
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed! Ready to deploy."
    echo ""
    echo "Next steps:"
    echo "  1. cd /Users/yuan/Documents/project/pocketable/terraform"
    echo "  2. ./deploy.sh"
    echo ""
    echo "Or manually:"
    echo "  1. cd environments/production"
    echo "  2. terraform init"
    echo "  3. terraform apply"
else
    echo "❌ $ERRORS error(s) found. Please fix them before deploying."
fi
echo "==========================================="
