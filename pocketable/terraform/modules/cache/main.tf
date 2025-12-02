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
