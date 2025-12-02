output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = module.loadbalancer.alb_dns_name
}

output "load_balancer_url" {
  description = "Full URL of the application"
  value       = "http://${module.loadbalancer.alb_dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing Docker images"
  value       = aws_ecr_repository.pocketable_backend.repository_url
}

output "database_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.cache.endpoint
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.compute.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.compute.service_name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for application logs"
  value       = module.compute.log_group_name
}
