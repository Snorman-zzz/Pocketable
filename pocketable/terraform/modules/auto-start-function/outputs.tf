output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.auto_start.arn
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.auto_start.function_name
}

output "api_endpoint" {
  description = "API Gateway endpoint URL to trigger auto-start"
  value       = "${aws_apigatewayv2_api.auto_start.api_endpoint}/start"
}

output "api_gateway_id" {
  description = "ID of the API Gateway"
  value       = aws_apigatewayv2_api.auto_start.id
}
