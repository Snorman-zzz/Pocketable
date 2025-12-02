output "anthropic_api_key_arn" {
  value = aws_secretsmanager_secret.anthropic_api_key.arn
}

output "openai_api_key_arn" {
  value = aws_secretsmanager_secret.openai_api_key.arn
}

output "daytona_api_key_arn" {
  value = aws_secretsmanager_secret.daytona_api_key.arn
}
