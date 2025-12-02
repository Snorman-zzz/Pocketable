output "lambda_function_arn" {
  description = "ARN of the auto-stop Lambda function"
  value       = aws_lambda_function.auto_stop.arn
}

output "lambda_function_name" {
  description = "Name of the auto-stop Lambda function"
  value       = aws_lambda_function.auto_stop.function_name
}
