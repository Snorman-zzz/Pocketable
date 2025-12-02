output "instance_id" {
  description = "ID of the Daytona EC2 instance"
  value       = aws_instance.daytona.id
}

output "instance_arn" {
  description = "ARN of the Daytona EC2 instance"
  value       = aws_instance.daytona.arn
}

output "public_ip" {
  description = "Elastic IP address of the Daytona instance"
  value       = aws_eip.daytona.public_ip
}

output "private_ip" {
  description = "Private IP address of the Daytona instance"
  value       = aws_instance.daytona.private_ip
}

output "security_group_id" {
  description = "ID of the Daytona security group"
  value       = aws_security_group.daytona.id
}

output "daytona_api_url" {
  description = "Daytona API URL"
  value       = "http://${aws_eip.daytona.public_ip}:3000/api"
}

output "data_volume_id" {
  description = "ID of the EBS data volume"
  value       = aws_ebs_volume.daytona_data.id
}
