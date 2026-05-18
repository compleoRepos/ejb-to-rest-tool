# ============================================================
# Outputs Terraform — Informations post-déploiement
# ============================================================

output "app_public_ip" {
  description = "Adresse IP publique de l'application"
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "URL de l'application"
  value       = "http://${aws_eip.app.public_ip}:3000"
}

output "ssh_command" {
  description = "Commande SSH pour se connecter à l'instance"
  value       = "ssh -i ~/.ssh/modernizer ubuntu@${aws_eip.app.public_ip}"
}

output "db_endpoint" {
  description = "Endpoint de la base de données RDS"
  value       = aws_db_instance.main.endpoint
}

output "db_connection_string" {
  description = "Chaîne de connexion MySQL"
  value       = "mysql://${var.db_username}:****@${aws_db_instance.main.address}:3306/${var.db_name}"
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Nom du bucket S3 pour les artefacts"
  value       = aws_s3_bucket.artifacts.id
}

output "ec2_instance_id" {
  description = "ID de l'instance EC2"
  value       = aws_instance.app.id
}

output "vpc_id" {
  description = "ID du VPC"
  value       = aws_vpc.main.id
}

output "estimated_monthly_cost" {
  description = "Coût mensuel estimé"
  value       = "~438 EUR/mois (EC2 g4dn.xlarge: ~400 EUR + RDS db.t3.small: ~30 EUR + S3: ~5 EUR + EIP: ~3 EUR)"
}
