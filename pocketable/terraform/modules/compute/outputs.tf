output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.main.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.main.name
}
