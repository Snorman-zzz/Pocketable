terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Uncomment for remote state after initial setup
  # backend "s3" {
  #   bucket         = "pocketable-terraform-state"
  #   key            = "daytona-dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "pocketable-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "daytona-dev"
      Project     = "pocketable"
      ManagedBy   = "terraform"
      Purpose     = "self-hosted-daytona"
    }
  }
}

# Data source for default VPC (for simplicity in dev)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "availability-zone"
    values = ["us-east-1a"]
  }
}

data "aws_subnet" "selected" {
  id = data.aws_subnets.default.ids[0]
}

# SSH Key Pair (must be created manually or imported)
# Create with: aws ec2 create-key-pair --key-name pocketable-daytona-dev --query 'KeyMaterial' --output text > ~/.ssh/pocketable-daytona-dev.pem
resource "aws_key_pair" "daytona" {
  count      = var.create_ssh_key ? 1 : 0
  key_name   = var.ssh_key_name
  public_key = file(var.ssh_public_key_path)

  tags = {
    Name = var.ssh_key_name
  }
}

# Daytona Instance Module
module "daytona_instance" {
  source = "../../modules/daytona-instance"

  environment       = "daytona-dev"
  vpc_id            = data.aws_vpc.default.id
  subnet_id         = data.aws_subnet.selected.id
  availability_zone = data.aws_subnet.selected.availability_zone

  instance_type     = var.instance_type
  data_volume_size  = var.data_volume_size
  ssh_key_name      = var.ssh_key_name

  allowed_ssh_cidrs = var.allowed_ssh_cidrs

  anthropic_api_key = var.anthropic_api_key
  openai_api_key    = var.openai_api_key

  secrets_arns = []
}

# Auto-Start Lambda Function Module
module "auto_start_function" {
  source = "../../modules/auto-start-function"

  environment     = "daytona-dev"
  instance_id     = module.daytona_instance.instance_id
  daytona_api_url = module.daytona_instance.daytona_api_url
  # backend_url not needed - backend runs on separate ECS cluster
}

# Auto-Stop Lambda Function Module
module "auto_stop_function" {
  count       = var.enable_auto_stop ? 1 : 0
  source      = "../../modules/auto-stop-function"

  environment        = "daytona-dev"
  instance_id        = module.daytona_instance.instance_id
  daytona_api_key    = var.daytona_api_key
  instance_public_ip = module.daytona_instance.public_ip
}

# CloudWatch Event Rule for Auto-Stop
# Runs every 30 minutes to check if instance should be stopped
resource "aws_cloudwatch_event_rule" "auto_stop" {
  count               = var.enable_auto_stop ? 1 : 0
  name                = "daytona-dev-auto-stop"
  description         = "Trigger auto-stop check for Daytona instance every 30 minutes"
  schedule_expression = "rate(30 minutes)"

  tags = {
    Name = "daytona-dev-auto-stop"
  }
}

# CloudWatch Event Target - Invoke Lambda
resource "aws_cloudwatch_event_target" "auto_stop" {
  count     = var.enable_auto_stop ? 1 : 0
  rule      = aws_cloudwatch_event_rule.auto_stop[0].name
  target_id = "DaytonaAutoStopLambda"
  arn       = module.auto_stop_function[0].lambda_function_arn

  input = jsonencode({
    instance_id = module.daytona_instance.instance_id
  })
}

# Permission for CloudWatch Events to invoke Lambda
resource "aws_lambda_permission" "allow_cloudwatch" {
  count         = var.enable_auto_stop ? 1 : 0
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = module.auto_stop_function[0].lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_stop[0].arn
}
