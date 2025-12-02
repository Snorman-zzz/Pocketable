variable "environment" {
  description = "Environment name (e.g., dev, staging, production)"
  type        = string
}

variable "instance_id" {
  description = "ID of the EC2 instance to manage"
  type        = string
}

variable "daytona_api_url" {
  description = "URL of the Daytona API"
  type        = string
}

variable "backend_url" {
  description = "URL of the backend API (optional - only if backend runs on same instance)"
  type        = string
  default     = ""
}
