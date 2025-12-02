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
