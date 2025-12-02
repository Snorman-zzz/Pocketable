# Lambda Auto-Stop Function Module
# Monitors EC2 instance network activity and stops it when idle

# Package Lambda function
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/stop_instance.py"
  output_path = "${path.module}/lambda/stop_instance.zip"
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${var.environment}-daytona-auto-stop-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.environment}-daytona-auto-stop-lambda"
    Environment = var.environment
  }
}

# Attach basic Lambda execution role
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Policy to manage EC2 instances and read CloudWatch metrics
resource "aws_iam_role_policy" "lambda_ec2_cloudwatch" {
  name = "${var.environment}-lambda-ec2-cloudwatch-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:StopInstances"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "auto_stop" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "${var.environment}-daytona-auto-stop"
  role             = aws_iam_role.lambda.arn
  handler          = "stop_instance.lambda_handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "python3.11"
  timeout          = 60  # 1 minute (just needs to check metrics and stop)
  memory_size      = 128

  environment {
    variables = {
      DAYTONA_API_KEY     = var.daytona_api_key
      INSTANCE_PUBLIC_IP  = var.instance_public_ip
    }
  }

  tags = {
    Name        = "${var.environment}-daytona-auto-stop"
    Environment = var.environment
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.auto_stop.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "${var.environment}-daytona-auto-stop-logs"
    Environment = var.environment
  }
}
