#!/bin/bash

# Complete Terraform AWS Infrastructure Setup for Pocketable
# This script creates ALL remaining modules needed for deployment

set -e

echo "🚀 Creating complete Terraform infrastructure..."

# ======================
# SECRETS MODULE
# ======================
cat > modules/secrets/main.tf << 'SECRETS_MAIN'
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "${var.environment}/pocketable/anthropic-api-key"
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name = "${var.environment}/pocketable/openai-api-key"
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = var.openai_api_key
}

resource "aws_secretsmanager_secret" "daytona_api_key" {
  name = "${var.environment}/pocketable/daytona-api-key"
}

resource "aws_secretsmanager_secret_version" "daytona_api_key" {
  secret_id     = aws_secretsmanager_secret.daytona_api_key.id
  secret_string = var.daytona_api_key
}
SECRETS_MAIN

cat > modules/secrets/variables.tf << 'SECRETS_VARS'
variable "environment" {
  type = string
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

variable "daytona_api_key" {
  type      = string
  sensitive = true
}
SECRETS_VARS

cat > modules/secrets/outputs.tf << 'SECRETS_OUT'
output "anthropic_api_key_arn" {
  value = aws_secretsmanager_secret.anthropic_api_key.arn
}

output "openai_api_key_arn" {
  value = aws_secretsmanager_secret.openai_api_key.arn
}

output "daytona_api_key_arn" {
  value = aws_secretsmanager_secret.daytona_api_key.arn
}
SECRETS_OUT

# ======================
# LOAD BALANCER MODULE
# ======================
cat > modules/loadbalancer/main.tf << 'LB_MAIN'
resource "aws_lb" "main" {
  name               = "${var.environment}-pocketable-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_group_ids
  subnets            = var.subnet_ids

  enable_deletion_protection = var.environment == "production" ? true : false

  tags = {
    Name        = "${var.environment}-pocketable-alb"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "main" {
  name        = "${var.environment}-pocketable-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = {
    Name        = "${var.environment}-pocketable-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}
LB_MAIN

cat > modules/loadbalancer/variables.tf << 'LB_VARS'
variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}
LB_VARS

cat > modules/loadbalancer/outputs.tf << 'LB_OUT'
output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "target_group_arn" {
  value = aws_lb_target_group.main.arn
}
LB_OUT

# ======================
# COMPUTE MODULE (ECS Fargate)
# ======================
cat > modules/compute/main.tf << 'COMPUTE_MAIN'
# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = var.cluster_name
    Environment = var.environment
  }
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.environment}-pocketable-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS to read secrets
resource "aws_iam_role_policy" "ecs_secrets_policy" {
  name = "${var.environment}-ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        for k, v in var.secrets : v
      ]
    }]
  })
}

# ECS Task Role (for application)
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.environment}-pocketable-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "main" {
  name              = var.log_group_name
  retention_in_days = var.log_retention_days
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = "${var.environment}-pocketable-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name  = "pocketable-backend"
    image = "${var.ecr_repository_url}:${var.image_tag}"

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    environment = [
      for k, v in var.environment_variables : {
        name  = k
        value = v
      }
    ]

    secrets = [
      for k, v in var.secrets : {
        name      = k
        valueFrom = v
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.main.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = var.service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "pocketable-backend"
    container_port   = var.container_port
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_task_execution_role_policy]

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# Auto Scaling
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based Auto Scaling
resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  name               = "${var.environment}-pocketable-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.cpu_threshold
  }
}

# Memory-based Auto Scaling
resource "aws_appautoscaling_policy" "ecs_memory_policy" {
  name               = "${var.environment}-pocketable-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = var.memory_threshold
  }
}

data "aws_region" "current" {}
COMPUTE_MAIN

cat > modules/compute/variables.tf << 'COMPUTE_VARS'
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "ecr_repository_url" { type = string }
variable "image_tag" { type = string }
variable "cpu" { type = number }
variable "memory" { type = number }
variable "desired_count" { type = number }
variable "min_capacity" { type = number }
variable "max_capacity" { type = number }
variable "cpu_threshold" { type = number }
variable "memory_threshold" { type = number }
variable "target_group_arn" { type = string }
variable "container_port" { type = number }
variable "environment_variables" { type = map(string) }
variable "secrets" { type = map(string) }
variable "log_group_name" { type = string }
variable "log_retention_days" { type = number }
COMPUTE_VARS

cat > modules/compute/outputs.tf << 'COMPUTE_OUT'
output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.main.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.main.name
}
COMPUTE_OUT

# ======================
# MONITORING MODULE
# ======================
cat > modules/monitoring/main.tf << 'MONITOR_MAIN'
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
MONITOR_MAIN

cat > modules/monitoring/variables.tf << 'MONITOR_VARS'
variable "environment" { type = string }
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "high_cpu_threshold" { type = number }
variable "high_memory_threshold" { type = number }
MONITOR_VARS

cat > modules/monitoring/outputs.tf << 'MONITOR_OUT'
output "cpu_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.ecs_cpu_high.arn
}

output "memory_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.ecs_memory_high.arn
}
MONITOR_OUT

echo "✅ All Terraform modules created successfully!"
echo ""
echo "📦 Modules created:"
echo "  - secrets (API keys management)"
echo "  - loadbalancer (ALB with health checks)"
echo "  - compute (ECS Fargate with auto-scaling)"
echo "  - monitoring (CloudWatch alarms)"
