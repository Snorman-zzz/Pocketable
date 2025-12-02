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
