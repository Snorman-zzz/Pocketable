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
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:;.<>?"  # Exclude /, @, ", and space
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
