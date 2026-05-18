# ============================================================
# Variables Terraform — Java Legacy Modernizer
# ============================================================

# ---- Projet ----

variable "project_name" {
  description = "Nom du projet (utilisé pour nommer les ressources)"
  type        = string
  default     = "modernizer"
}

# ---- AWS ----

variable "aws_region" {
  description = "Région AWS"
  type        = string
  default     = "eu-west-3" # Paris
}

# ---- EC2 ----

variable "ec2_instance_type" {
  description = "Type d'instance EC2 (g4dn.xlarge = GPU T4 + 4 vCPU + 16 Go RAM)"
  type        = string
  default     = "g4dn.xlarge"
}

variable "ec2_volume_size" {
  description = "Taille du disque EBS en Go"
  type        = number
  default     = 100
}

variable "ssh_public_key" {
  description = "Clé SSH publique pour accéder à l'instance EC2"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs autorisés pour SSH (par défaut: partout, restreindre en prod)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ---- RDS MySQL ----

variable "rds_instance_class" {
  description = "Classe d'instance RDS (db.t3.small = 2 vCPU + 2 Go RAM)"
  type        = string
  default     = "db.t3.small"
}

variable "rds_storage_size" {
  description = "Taille du stockage RDS en Go"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Nom de la base de données"
  type        = string
  default     = "modernizer"
}

variable "db_username" {
  description = "Utilisateur de la base de données"
  type        = string
  default     = "modernizer"
}

variable "db_password" {
  description = "Mot de passe de la base de données"
  type        = string
  sensitive   = true
}

# ---- Sécurité ----

variable "jwt_secret" {
  description = "Clé secrète pour signer les tokens JWT"
  type        = string
  sensitive   = true
}

# ---- S3 ----

variable "s3_access_key" {
  description = "Clé d'accès S3 (IAM user)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "s3_secret_key" {
  description = "Clé secrète S3 (IAM user)"
  type        = string
  sensitive   = true
  default     = ""
}

# ---- Ollama ----

variable "ollama_model" {
  description = "Modèle Ollama à télécharger (deepseek-coder-v2:16b recommandé pour T4)"
  type        = string
  default     = "deepseek-coder-v2:16b"
}

# ---- Application ----

variable "github_repo" {
  description = "URL du repo GitHub pour cloner l'application"
  type        = string
  default     = "https://github.com/compleoRepos/ejb-to-rest-tool.git"
}

variable "domain_name" {
  description = "Nom de domaine personnalisé (optionnel, laisser vide pour IP seule)"
  type        = string
  default     = ""
}
