terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state after initial setup
  # backend "s3" {
  #   bucket         = "pocketable-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "pocketable-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "production"
      Project     = "pocketable"
      ManagedBy   = "terraform"
    }
  }
}

# Secrets Manager for API keys
module "secrets" {
  source = "../../modules/secrets"

  environment         = "production"
  anthropic_api_key   = var.anthropic_api_key
  openai_api_key      = var.openai_api_key
  daytona_api_key     = var.daytona_api_key
}

# Networking (VPC, Subnets, Security Groups)
module "networking" {
  source = "../../modules/networking"

  environment     = "production"
  vpc_cidr        = "10.0.0.0/16"
  azs             = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
}

# RDS PostgreSQL Database
module "database" {
  source = "../../modules/database"

  environment         = "production"
  vpc_id              = module.networking.vpc_id
  subnet_ids          = module.networking.private_subnet_ids
  security_group_ids  = [module.networking.database_security_group_id]

  instance_class      = "db.t3.micro"  # Free tier eligible for 12 months
  allocated_storage   = 20             # Free tier: 20GB
  engine_version      = "15.8"

  database_name       = "pocketable"
  master_username     = "pocketable_admin"

  backup_retention_period = 7
  multi_az                = false  # Set true for production HA
}

# ElastiCache Redis (for Socket.io state management)
module "cache" {
  source = "../../modules/cache"

  environment         = "production"
  vpc_id              = module.networking.vpc_id
  subnet_ids          = module.networking.private_subnet_ids
  security_group_ids  = [module.networking.cache_security_group_id]

  node_type           = "cache.t3.micro"
  num_cache_nodes     = 1
  engine_version      = "7.0"
}

# Application Load Balancer
module "loadbalancer" {
  source = "../../modules/loadbalancer"

  environment         = "production"
  vpc_id              = module.networking.vpc_id
  subnet_ids          = module.networking.public_subnet_ids
  security_group_ids  = [module.networking.alb_security_group_id]
}

# ECS Fargate Cluster & Auto-Scaling
module "compute" {
  source = "../../modules/compute"

  environment              = "production"
  vpc_id                   = module.networking.vpc_id
  subnet_ids               = module.networking.private_subnet_ids
  security_group_ids       = [module.networking.ecs_security_group_id]

  # ECS Configuration
  cluster_name             = "pocketable-production"
  service_name             = "pocketable-backend"

  # Docker Image (ECR repository)
  ecr_repository_url       = aws_ecr_repository.pocketable_backend.repository_url
  image_tag                = var.image_tag

  # Fargate Task Configuration
  cpu                      = 512   # 0.5 vCPU
  memory                   = 1024  # 1 GB
  desired_count            = 1     # Start with 1 task

  # Auto-scaling Configuration
  min_capacity             = 1
  max_capacity             = 10
  cpu_threshold            = 70    # Scale up at 70% CPU
  memory_threshold         = 80    # Scale up at 80% memory

  # Load Balancer Integration
  target_group_arn         = module.loadbalancer.target_group_arn
  container_port           = 3001

  # Environment Variables
  environment_variables = {
    NODE_ENV                  = "production"
    PORT                      = "3001"
    DATABASE_URL              = "postgresql://${module.database.master_username}:${urlencode(module.database.master_password)}@${module.database.endpoint}/${module.database.database_name}?sslmode=no-verify"
    REDIS_URL                 = "redis://${module.cache.endpoint}:6379"
    ROUTING_ENABLED           = "true"

    # Self-Hosted Daytona Configuration
    DAYTONA_API_URL           = var.daytona_api_url
    DAYTONA_ORGANIZATION_ID   = var.daytona_organization_id
    DAYTONA_TARGET            = var.daytona_target
    DAYTONA_SNAPSHOT_NAME     = var.daytona_snapshot_name
    DAYTONA_DOMAIN            = var.daytona_domain
    DAYTONA_PROXY_PROTOCOL    = var.daytona_proxy_protocol
    DAYTONA_PROXY_PORT        = var.daytona_proxy_port
  }

  # Secrets from AWS Secrets Manager
  secrets = {
    ANTHROPIC_API_KEY = module.secrets.anthropic_api_key_arn
    OPENAI_API_KEY    = module.secrets.openai_api_key_arn
    DAYTONA_API_KEY   = module.secrets.daytona_api_key_arn
  }

  # CloudWatch Logs
  log_group_name           = "/ecs/pocketable-production"
  log_retention_days       = 7
}

# CloudWatch Monitoring & Alarms
module "monitoring" {
  source = "../../modules/monitoring"

  environment          = "production"
  cluster_name         = module.compute.cluster_name
  service_name         = module.compute.service_name

  # Alert thresholds
  high_cpu_threshold   = 80
  high_memory_threshold = 85

  # SNS topic for alerts (optional)
  # alarm_email          = var.alarm_email
}

# ECR Repository for Docker images
resource "aws_ecr_repository" "pocketable_backend" {
  name                 = "pocketable/backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# ECR Lifecycle Policy (keep last 10 images)
resource "aws_ecr_lifecycle_policy" "pocketable_backend" {
  repository = aws_ecr_repository.pocketable_backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}
