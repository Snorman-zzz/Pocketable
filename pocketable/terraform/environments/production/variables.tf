variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "anthropic_api_key" {
  description = "Anthropic Claude API key"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "daytona_api_key" {
  description = "Daytona API key"
  type        = string
  sensitive   = true
}

variable "daytona_api_url" {
  description = "Daytona API URL for self-hosted instance"
  type        = string
  default     = "http://98.91.121.91:3000/api"
}

variable "daytona_organization_id" {
  description = "Daytona organization ID"
  type        = string
}

variable "daytona_target" {
  description = "Daytona target (e.g., 'us')"
  type        = string
  default     = "us"
}

variable "daytona_snapshot_name" {
  description = "Daytona snapshot/image name with pre-installed dependencies"
  type        = string
  default     = "ubuntu-node20"
}

variable "daytona_domain" {
  description = "Custom domain for Daytona preview URLs (e.g., proxy.daytona.pocketable.dev)"
  type        = string
  default     = ""
}

variable "daytona_proxy_protocol" {
  description = "Protocol for Daytona preview URLs (http or https)"
  type        = string
  default     = "https"
}

variable "daytona_proxy_port" {
  description = "Port for Daytona preview URLs (defaults to 443 for https, 4000 for http)"
  type        = string
  default     = "443"
}

# Optional: Email for CloudWatch alarms
# variable "alarm_email" {
#   description = "Email address for CloudWatch alarms"
#   type        = string
#   default     = ""
# }
