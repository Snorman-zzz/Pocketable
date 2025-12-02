output "instance_id" {
  description = "ID of the Daytona EC2 instance"
  value       = module.daytona_instance.instance_id
}

output "instance_public_ip" {
  description = "Public IP address of the Daytona instance (Elastic IP)"
  value       = module.daytona_instance.public_ip
}

output "daytona_api_url" {
  description = "Daytona API URL"
  value       = module.daytona_instance.daytona_api_url
}

output "auto_start_api_endpoint" {
  description = "API Gateway endpoint to trigger auto-start"
  value       = module.auto_start_function.api_endpoint
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.ssh_key_name}.pem ubuntu@${module.daytona_instance.public_ip}"
}

output "env_configuration" {
  description = "Backend .env configuration"
  value = <<-EOT
    # Add these to your backend/.env:
    DAYTONA_API_URL=${module.daytona_instance.daytona_api_url}
    DAYTONA_SNAPSHOT_NAME=ubuntu-node20

    # Get DAYTONA_API_KEY and DAYTONA_ORGANIZATION_ID from:
    # ssh -i ~/.ssh/${var.ssh_key_name}.pem ubuntu@${module.daytona_instance.public_ip}
    # cat ~/daytona-status.json
  EOT
}

output "cost_estimate" {
  description = "Estimated monthly costs"
  value = <<-EOT
    EC2 Instance (t3.xlarge): $0.1664/hour
    - Always-on (720 hrs/month): ~$120/month
    - Dev usage (40 hrs/month): ~$6.66/month

    EBS Storage (100 GB): ~$10/month

    Lambda + API Gateway: ~$0.01/month (minimal usage)

    Total estimated cost:
    - Stop/start model (40 hrs dev): ~$17-20/month
    - Always-on: ~$130-140/month
  EOT
}
