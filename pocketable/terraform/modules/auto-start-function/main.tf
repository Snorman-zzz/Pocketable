# Lambda Auto-Start Function Module
# Provides serverless auto-start capability for the Daytona instance

# Package Lambda function
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/start_instance.py"
  output_path = "${path.module}/lambda/start_instance.zip"
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${var.environment}-daytona-auto-start-lambda"

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
    Name        = "${var.environment}-daytona-auto-start-lambda"
    Environment = var.environment
  }
}

# Attach basic Lambda execution role
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Policy to manage EC2 instances and SSM
resource "aws_iam_role_policy" "lambda_ec2" {
  name = "${var.environment}-lambda-ec2-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:StartInstances",
          "ec2:DescribeInstanceStatus"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:SendCommand",
          "ssm:GetCommandInvocation"
        ]
        Resource = "*"
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "auto_start" {
  filename         = data.archive_file.lambda.output_path
  function_name    = "${var.environment}-daytona-auto-start"
  role             = aws_iam_role.lambda.arn
  handler          = "start_instance.lambda_handler"
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "python3.11"
  timeout          = 300  # 5 minutes (enough for instance to start + services to initialize)
  memory_size      = 256

  environment {
    variables = merge(
      {
        INSTANCE_ID      = var.instance_id
        DAYTONA_API_URL  = var.daytona_api_url
        MAX_WAIT_SECONDS = "180" # 3 minutes to wait for services
      },
      var.backend_url != "" ? { BACKEND_URL = var.backend_url } : {}
    )
  }

  tags = {
    Name        = "${var.environment}-daytona-auto-start"
    Environment = var.environment
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.auto_start.function_name}"
  retention_in_days = 7

  tags = {
    Name        = "${var.environment}-daytona-auto-start-logs"
    Environment = var.environment
  }
}

# API Gateway (HTTP API)
resource "aws_apigatewayv2_api" "auto_start" {
  name          = "${var.environment}-daytona-auto-start-api"
  protocol_type = "HTTP"
  description   = "API Gateway to trigger Daytona instance auto-start"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["*"]
  }

  tags = {
    Name        = "${var.environment}-daytona-auto-start-api"
    Environment = var.environment
  }
}

# API Gateway Integration with Lambda
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.auto_start.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auto_start.invoke_arn
  payload_format_version = "2.0"
}

# API Gateway Route
resource "aws_apigatewayv2_route" "start" {
  api_id    = aws_apigatewayv2_api.auto_start.id
  route_key = "GET /start"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API Gateway Stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.auto_start.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  tags = {
    Name        = "${var.environment}-daytona-auto-start-stage"
    Environment = var.environment
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.environment}-daytona-auto-start"
  retention_in_days = 7

  tags = {
    Name        = "${var.environment}-daytona-auto-start-api-logs"
    Environment = var.environment
  }
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_start.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.auto_start.execution_arn}/*/*"
}
