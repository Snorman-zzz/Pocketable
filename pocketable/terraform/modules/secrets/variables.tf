variable "environment" {
  type = string
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

variable "daytona_api_key" {
  type      = string
  sensitive = true
}
