variable "aws_region" {
  description = "AWS region for the production environment."
  type        = string
  default     = "af-south-1"
}

variable "vpc_id" {
  description = "Existing VPC ID for ECS networking."
  type        = string
}

variable "public_subnets" {
  description = "Public subnets for the ALB."
  type        = list(string)
}

variable "private_subnets" {
  description = "Private subnets for ECS tasks."
  type        = list(string)
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository Terraform creates for the API."
  type        = string
  default     = "neyd-api"
}

variable "ecr_web_repository_name" {
  description = "Name of the ECR repository Terraform creates for the dashboard."
  type        = string
  default     = "neyd-web"
}

variable "initial_desired_count" {
  description = "Initial desired count; keep at zero until the first GitHub Actions image deployment."
  type        = number
  default     = 0
}

variable "github_owner" {
  description = "GitHub account or organization that owns the repository."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name used to scope the Actions OIDC trust."
  type        = string
}

variable "application_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL, JWT_SECRET and Daraja JSON keys."
  type        = string
  sensitive   = true
}

variable "api_domain" {
  description = "Public HTTPS API hostname used by the ALB and M-Pesa callbacks."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone that owns api_domain."
  type        = string
}

variable "acm_certificate_arn" {
  description = "Issued ACM certificate ARN covering api_domain in aws_region."
  type        = string
}

variable "web_origin" {
  description = "Allowed browser origin for the dashboard, e.g. https://support.example.com."
  type        = string
}

variable "mpesa_environment" {
  description = "Safaricom Daraja environment."
  type        = string
  default     = "sandbox"

  validation {
    condition     = contains(["sandbox", "live"], var.mpesa_environment)
    error_message = "mpesa_environment must be sandbox or live."
  }
}
