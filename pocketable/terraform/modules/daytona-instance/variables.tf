variable "environment" {
  description = "Environment name (e.g., dev, staging, production)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the instance will be launched"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID where the instance will be launched"
  type        = string
}

variable "availability_zone" {
  description = "Availability zone for the instance and EBS volume"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "data_volume_size" {
  description = "Size of the EBS data volume in GB"
  type        = number
  default     = 100
}

variable "allowed_ssh_cidrs" {
  description = "List of CIDR blocks allowed to SSH to the instance"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ssh_key_name" {
  description = "Name of the SSH key pair to use for the instance"
  type        = string
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

variable "secrets_arns" {
  description = "List of AWS Secrets Manager ARNs the instance can access"
  type        = list(string)
  default     = []
}
