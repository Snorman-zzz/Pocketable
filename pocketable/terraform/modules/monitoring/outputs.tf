output "cpu_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.ecs_cpu_high.arn
}

output "memory_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.ecs_memory_high.arn
}
