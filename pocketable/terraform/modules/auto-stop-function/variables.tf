variable "environment" {
  description = "Environment name (e.g., daytona-dev, production)"
  type        = string
}

variable "instance_id" {
  description = "EC2 instance ID to monitor and stop"
  type        = string
}

variable "daytona_api_key" {
  description = "Daytona API key for checking active workspaces"
  type        = string
  sensitive   = true
}

variable "instance_public_ip" {
  description = "Public IP address of the EC2 instance for Daytona API calls"
  type        = string
}
