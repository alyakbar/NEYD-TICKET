output "api_url" {
  description = "Public HTTPS URL for the NEYD API."
  value       = "https://${var.api_domain}"
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster hosting the application."
  value       = aws_ecs_cluster.neyd_cluster.name
}

output "api_service_name" {
  description = "Name of the ECS service."
  value       = aws_ecs_service.api_service.name
}

output "web_service_name" {
  description = "Name of the ECS service hosting the dashboard."
  value       = aws_ecs_service.web_service.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_web_repository_url" {
  description = "ECR repository URL for the dashboard image."
  value       = aws_ecr_repository.web.repository_url
}

output "ecs_security_group_id" {
  description = "Security group attached to ECS tasks; configure it in the deployment workflow."
  value       = aws_security_group.ecs.id
}

output "ecs_private_subnet_ids" {
  description = "Private subnets used by ECS tasks; configure them in the deployment workflow."
  value       = var.private_subnets
}

output "github_actions_deploy_role_arn" {
  description = "IAM role ARN to configure as the AWS_DEPLOY_ROLE_ARN GitHub secret."
  value       = aws_iam_role.github_actions_deploy.arn
}
