# CPU Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.environment}-pocketable-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.high_cpu_threshold
  alarm_description   = "ECS CPU utilization is too high"

  dimensions = {
    ServiceName = var.service_name
    ClusterName = var.cluster_name
  }
}

# Memory Utilization Alarm
resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${var.environment}-pocketable-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.high_memory_threshold
  alarm_description   = "ECS memory utilization is too high"

  dimensions = {
    ServiceName = var.service_name
    ClusterName = var.cluster_name
  }
}
