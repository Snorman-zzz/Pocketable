#!/bin/bash

# This script generates all remaining Terraform modules for Pocketable AWS deployment

set -e

echo "🏗️  Generating Terraform modules for Pocketable..."

# Create database module
cat > modules/database/main.tf << 'EOF'
# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-pocketable-db-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.environment}-pocketable-db-subnet"
    Environment = var.environment
  }
}

# Random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-pocketable-db"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2  # Auto-scaling storage

  db_name  = var.database_name
  username = var.master_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids

  # Backups
  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  # Performance Insights
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = false  # Enable for $$ monitoring

  # High Availability
  multi_az = var.multi_az

  # Deletion protection
  deletion_protection = var.environment == "production" ? true : false
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.environment}-pocketable-db-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  # Encryption
  storage_encrypted = true

  tags = {
    Name        = "${var.environment}-pocketable-db"
    Environment = var.environment
  }
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.environment}/pocketable/database-password"

  tags = {
    Name        = "${var.environment}-pocketable-db-password"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}
EOF

cat > modules/database/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for DB subnet group"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "pocketable"
}

variable "master_username" {
  description = "Master username"
  type        = string
  default     = "pocketable_admin"
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "multi_az" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = false
}
EOF

cat > modules/database/outputs.tf << 'EOF'
output "endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "master_username" {
  description = "Master username"
  value       = aws_db_instance.main.username
}

output "master_password" {
  description = "Master password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "password_secret_arn" {
  description = "ARN of the password secret"
  value       = aws_secretsmanager_secret.db_password.arn
}
EOF

echo "✅ Database module created"

# Create cache module (ElastiCache Redis)
cat > modules/cache/main.tf << 'EOF'
# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-pocketable-cache-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.environment}-pocketable-cache-subnet"
    Environment = var.environment
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.environment}-pocketable-redis"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = var.security_group_ids

  # Maintenance
  maintenance_window = "sun:05:00-sun:06:00"

  # Snapshot
  snapshot_retention_limit = 5
  snapshot_window          = "03:00-04:00"

  tags = {
    Name        = "${var.environment}-pocketable-redis"
    Environment = var.environment
  }
}
EOF

cat > modules/cache/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "node_type" {
  description = "Cache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}
EOF

cat > modules/cache/outputs.tf << 'EOF'
output "endpoint" {
  description = "Redis endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "port" {
  description = "Redis port"
  value       = aws_elasticache_cluster.main.port
}
EOF

echo "✅ Cache module created"

echo "🎉 All Terraform modules generated successfully!"
echo ""
echo "Next steps:"
echo "1. Review the generated modules in terraform/modules/"
echo "2. Continue with the remaining modules (compute, loadbalancer, etc.)"
