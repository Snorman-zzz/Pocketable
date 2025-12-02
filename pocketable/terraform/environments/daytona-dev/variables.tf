variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type for Daytona"
  type        = string
  default     = "t3.medium"
}

variable "data_volume_size" {
  description = "Size of EBS data volume in GB"
  type        = number
  default     = 100
}

variable "ssh_key_name" {
  description = "Name of SSH key pair for EC2 access"
  type        = string
  default     = "pocketable-daytona-dev"
}

variable "create_ssh_key" {
  description = "Whether to create SSH key pair (false if key already exists)"
  type        = bool
  default     = false
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key file (only used if create_ssh_key is true)"
  type        = string
  default     = "~/.ssh/pocketable-daytona-dev.pub"
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH to the instance"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # WARNING: Open to world. Restrict in production!
}

variable "anthropic_api_key" {
  description = "Anthropic API key for Claude"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "daytona_api_key" {
  description = "Daytona API key for workspace monitoring"
  type        = string
  sensitive   = true
}

variable "enable_auto_stop" {
  description = "Enable automatic stop after inactivity"
  type        = bool
  default     = true
}
