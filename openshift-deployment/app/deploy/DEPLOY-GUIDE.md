# Guide de Déploiement — Java Legacy Modernizer

**Version** : 4.0  
**Date** : Mai 2026  
**Auteur** : Compleo  
**Infrastructure** : AWS (EC2 GPU + RDS MySQL + S3)  
**Budget estimé** : ~438 EUR/mois

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Créer un compte AWS](#2-créer-un-compte-aws)
3. [Installer les outils sur votre PC](#3-installer-les-outils-sur-votre-pc)
4. [Générer une clé SSH](#4-générer-une-clé-ssh)
5. [Configurer les credentials AWS](#5-configurer-les-credentials-aws)
6. [Lancer le déploiement Terraform](#6-lancer-le-déploiement-terraform)
7. [Vérifier l'installation](#7-vérifier-linstallation)
8. [Configurer un nom de domaine (optionnel)](#8-configurer-un-nom-de-domaine-optionnel)
9. [Maintenance et opérations courantes](#9-maintenance-et-opérations-courantes)
10. [Dépannage](#10-dépannage)
11. [Coûts détaillés](#11-coûts-détaillés)

---

## 1. Prérequis

Avant de commencer, assurez-vous d'avoir les éléments suivants sur votre ordinateur.

| Outil | Version minimale | Téléchargement |
|---|---|---|
| **Terraform** | 1.5+ | https://developer.hashicorp.com/terraform/install |
| **AWS CLI** | 2.x | https://aws.amazon.com/fr/cli/ |
| **Git** | 2.x | https://git-scm.com/downloads |

Vous aurez également besoin d'une **carte bancaire** (Visa ou Mastercard) pour créer le compte AWS.

---

## 2. Créer un compte AWS

Si vous n'avez pas encore de compte AWS, suivez ces étapes.

**Étape 2.1** — Rendez-vous sur https://aws.amazon.com/fr/free/ et cliquez sur **"Créer un compte AWS"**.

**Étape 2.2** — Remplissez le formulaire d'inscription avec votre adresse email professionnelle, un mot de passe fort, et le nom de votre compte (par exemple : `compleo-modernizer`).

**Étape 2.3** — Entrez vos coordonnées de facturation et votre carte bancaire. AWS facturera un montant de vérification de 1 USD qui sera remboursé.

**Étape 2.4** — Choisissez le plan **"Basic Support — Free"** (suffisant pour notre usage).

**Étape 2.5** — Connectez-vous à la console AWS : https://console.aws.amazon.com

---

## 3. Installer les outils sur votre PC

### 3.1 Installer Terraform (Windows)

Ouvrez PowerShell en tant qu'administrateur et exécutez les commandes suivantes.

```powershell
# Option 1: Via Chocolatey (si installé)
choco install terraform

# Option 2: Téléchargement manuel
# 1. Allez sur https://developer.hashicorp.com/terraform/install
# 2. Téléchargez la version Windows AMD64
# 3. Décompressez le fichier ZIP
# 4. Placez terraform.exe dans C:\terraform\
# 5. Ajoutez C:\terraform\ au PATH système
```

Vérifiez l'installation en tapant dans un terminal :

```powershell
terraform --version
# Doit afficher: Terraform v1.x.x
```

### 3.2 Installer AWS CLI (Windows)

```powershell
# Téléchargez et installez depuis:
# https://awscli.amazonaws.com/AWSCLIV2.msi

# Vérifiez:
aws --version
# Doit afficher: aws-cli/2.x.x
```

---

## 4. Générer une clé SSH

La clé SSH vous permettra de vous connecter à votre serveur EC2. Ouvrez un terminal et exécutez la commande suivante.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/modernizer -C "votre-email@compleo.com"
```

Appuyez sur **Entrée** deux fois (pas de passphrase pour simplifier). Deux fichiers seront créés :
- `~/.ssh/modernizer` — clé privée (ne la partagez jamais)
- `~/.ssh/modernizer.pub` — clé publique (à utiliser dans Terraform)

Affichez la clé publique pour la copier plus tard :

```bash
cat ~/.ssh/modernizer.pub
# Affiche: ssh-ed25519 AAAA... votre-email@compleo.com
```

---

## 5. Configurer les credentials AWS

### 5.1 Créer un utilisateur IAM

**Étape 5.1.1** — Connectez-vous à la console AWS et allez dans **IAM** (Identity and Access Management) : https://console.aws.amazon.com/iam/

**Étape 5.1.2** — Cliquez sur **"Utilisateurs"** dans le menu de gauche, puis **"Créer un utilisateur"**.

**Étape 5.1.3** — Nommez l'utilisateur `modernizer-deployer` et cochez **"Accès par programmation"**.

**Étape 5.1.4** — Attachez la politique **"AdministratorAccess"** (pour simplifier le déploiement initial ; vous pourrez restreindre les permissions plus tard).

**Étape 5.1.5** — Créez l'utilisateur et **notez soigneusement** l'Access Key ID et le Secret Access Key. Vous ne pourrez plus les voir après cette étape.

### 5.2 Configurer AWS CLI

Dans votre terminal, exécutez la commande suivante et entrez les credentials de l'étape précédente.

```bash
aws configure
```

| Question | Réponse |
|---|---|
| AWS Access Key ID | Collez votre Access Key ID |
| AWS Secret Access Key | Collez votre Secret Access Key |
| Default region name | `eu-west-3` |
| Default output format | `json` |

Vérifiez que la configuration fonctionne :

```bash
aws sts get-caller-identity
# Doit afficher votre Account ID et votre ARN
```

---

## 6. Lancer le déploiement Terraform

### 6.1 Préparer la configuration

Ouvrez un terminal dans le dossier du projet et naviguez vers le répertoire Terraform.

```bash
cd ejb-client-modernizer/deploy/terraform
```

Copiez le fichier d'exemple et éditez-le avec vos valeurs.

```bash
cp terraform.tfvars.example terraform.tfvars
```

Ouvrez `terraform.tfvars` dans un éditeur de texte et modifiez les valeurs suivantes.

| Variable | Ce qu'il faut mettre |
|---|---|
| `ssh_public_key` | Le contenu de `~/.ssh/modernizer.pub` (étape 4) |
| `ssh_allowed_cidrs` | Votre IP publique suivi de `/32` (trouvez-la avec `curl ifconfig.me`) |
| `db_password` | Un mot de passe fort (min 16 caractères, lettres + chiffres + symboles) |
| `jwt_secret` | Une chaîne aléatoire de 64 caractères |

Pour générer un mot de passe et un JWT secret aléatoires, utilisez les commandes suivantes.

```bash
# Générer un mot de passe DB
openssl rand -base64 24
# Exemple: K7x9mP2qR5vW8nJ3hL6yT4bF

# Générer un JWT secret
openssl rand -hex 32
# Exemple: a1b2c3d4e5f6...64 caractères
```

### 6.2 Initialiser Terraform

```bash
terraform init
```

Cette commande télécharge les plugins AWS nécessaires. Vous devriez voir le message **"Terraform has been successfully initialized!"**.

### 6.3 Prévisualiser le déploiement

```bash
terraform plan
```

Terraform affiche la liste de toutes les ressources qui seront créées (environ 15 ressources). Vérifiez que tout semble correct : 1 instance EC2, 1 base RDS, 1 bucket S3, etc.

### 6.4 Lancer le déploiement

```bash
terraform apply
```

Terraform vous demande confirmation. Tapez **`yes`** et appuyez sur Entrée. Le déploiement prend environ **10-15 minutes**. Les étapes les plus longues sont la création de l'instance RDS (~5 min) et l'initialisation de l'EC2 (~5 min).

Une fois terminé, Terraform affiche les informations de connexion.

```
Outputs:

app_public_ip    = "13.38.xxx.xxx"
app_url          = "http://13.38.xxx.xxx:3000"
ssh_command      = "ssh -i ~/.ssh/modernizer ubuntu@13.38.xxx.xxx"
db_endpoint      = "modernizer-db.xxxxx.eu-west-3.rds.amazonaws.com:3306"
s3_bucket_name   = "modernizer-artifacts-a1b2c3d4"
```

**Notez l'adresse IP publique** — c'est l'adresse de votre application.

### 6.5 Attendre l'initialisation complète

L'instance EC2 exécute automatiquement un script d'initialisation qui installe Docker, Ollama, Node.js, clone le repo et lance l'application. Ce processus prend environ **15-20 minutes supplémentaires** (le téléchargement du modèle LLM est la partie la plus longue).

Vous pouvez suivre la progression en vous connectant en SSH.

```bash
ssh -i ~/.ssh/modernizer ubuntu@VOTRE_IP_PUBLIQUE
sudo tail -f /var/log/modernizer-setup.log
```

Attendez de voir le message **"Installation terminée !"** avant de continuer.

---

## 7. Vérifier l'installation

### 7.1 Vérifier l'application

Ouvrez votre navigateur et allez sur `http://VOTRE_IP_PUBLIQUE` (port 80, Nginx redirige vers l'app).

Vous devriez voir la page d'accueil du Java Legacy Modernizer.

### 7.2 Vérifier Ollama

Connectez-vous en SSH et vérifiez que le modèle LLM est disponible.

```bash
ssh -i ~/.ssh/modernizer ubuntu@VOTRE_IP_PUBLIQUE

# Vérifier Ollama
curl http://localhost:11434/api/tags
# Doit lister le modèle deepseek-coder-v2:16b

# Vérifier le GPU
nvidia-smi
# Doit afficher la carte NVIDIA T4 avec 16 Go de VRAM
```

### 7.3 Vérifier la base de données

```bash
# Vérifier que l'app se connecte à la DB
journalctl -u modernizer --no-pager | grep -i "database\|mysql\|bootstrap"
```

### 7.4 Tester une migration

Depuis le navigateur, allez sur la page **Agent IA**, uploadez un fichier ZIP de projet Java EE, et lancez une migration. Le pipeline devrait fonctionner avec Ollama local.

---

## 8. Configurer un nom de domaine (optionnel)

Si vous avez un nom de domaine (par exemple `modernizer.compleo.com`), suivez ces étapes.

**Étape 8.1** — Chez votre registrar DNS, créez un enregistrement A pointant vers l'IP publique de votre instance EC2.

| Type | Nom | Valeur |
|---|---|---|
| A | modernizer.compleo.com | VOTRE_IP_PUBLIQUE |

**Étape 8.2** — Connectez-vous en SSH et activez le certificat SSL.

```bash
ssh -i ~/.ssh/modernizer ubuntu@VOTRE_IP_PUBLIQUE
sudo certbot --nginx -d modernizer.compleo.com
```

Suivez les instructions de Certbot. Le renouvellement est automatique.

---

## 9. Maintenance et opérations courantes

### 9.1 Mettre à jour l'application

```bash
ssh -i ~/.ssh/modernizer ubuntu@VOTRE_IP_PUBLIQUE
cd /opt/modernizer
git pull origin main
pnpm install --frozen-lockfile
pnpm run build
sudo systemctl restart modernizer
```

### 9.2 Voir les logs

```bash
# Logs de l'application
sudo journalctl -u modernizer -f

# Logs Ollama
sudo journalctl -u ollama -f

# Logs Nginx
sudo tail -f /var/log/nginx/access.log
```

### 9.3 Redémarrer les services

```bash
sudo systemctl restart modernizer   # Application
sudo systemctl restart ollama        # LLM
sudo systemctl restart nginx         # Reverse proxy
```

### 9.4 Changer le modèle LLM

```bash
# Télécharger un nouveau modèle
ollama pull qwen2.5-coder:14b

# Modifier la configuration
sudo nano /opt/modernizer/.env.production
# Changer OLLAMA_MODEL=qwen2.5-coder:14b

# Redémarrer
sudo systemctl restart modernizer
```

### 9.5 Sauvegarder la base de données

```bash
# Backup manuel
mysqldump -h ENDPOINT_RDS -u modernizer -p modernizer > backup_$(date +%Y%m%d).sql

# Les backups automatiques RDS sont configurés (rétention 7 jours)
```

---

## 10. Dépannage

### L'application ne démarre pas

```bash
# Vérifier les logs
sudo journalctl -u modernizer -n 50 --no-pager

# Vérifier que le port 3000 est libre
sudo lsof -i :3000

# Redémarrer
sudo systemctl restart modernizer
```

### Ollama ne répond pas

```bash
# Vérifier le statut
sudo systemctl status ollama

# Vérifier le GPU
nvidia-smi

# Redémarrer Ollama
sudo systemctl restart ollama
```

### Erreur de connexion à la base de données

```bash
# Tester la connexion
mysql -h ENDPOINT_RDS -u modernizer -p

# Vérifier le security group (port 3306 ouvert depuis l'EC2)
# Console AWS > EC2 > Security Groups > modernizer-db-sg
```

### L'instance EC2 est lente

```bash
# Vérifier l'utilisation mémoire
free -h

# Vérifier l'utilisation CPU
top

# Vérifier l'utilisation GPU
nvidia-smi
```

---

## 11. Coûts détaillés

Le tableau suivant détaille les coûts mensuels estimés pour la configuration recommandée en région `eu-west-3` (Paris).

| Service | Type | Spécification | Coût/mois (EUR) |
|---|---|---|---|
| EC2 | g4dn.xlarge | 4 vCPU, 16 Go RAM, GPU T4, 100 Go SSD | ~400 |
| RDS MySQL | db.t3.small | 2 vCPU, 2 Go RAM, 20 Go SSD | ~30 |
| S3 | Standard | ~10 Go de ZIPs et rapports | ~1 |
| Elastic IP | - | 1 IP fixe | ~3 |
| Transfert données | - | ~50 Go sortant/mois | ~4 |
| **Total** | | | **~438** |

Pour réduire les coûts en dehors des heures de travail, vous pouvez arrêter l'instance EC2 le soir et le week-end. Cela réduit le coût EC2 d'environ 60% (seul le stockage EBS est facturé quand l'instance est arrêtée).

```bash
# Arrêter l'instance (soir/week-end)
aws ec2 stop-instances --instance-ids VOTRE_INSTANCE_ID --region eu-west-3

# Redémarrer l'instance (matin)
aws ec2 start-instances --instance-ids VOTRE_INSTANCE_ID --region eu-west-3
```

Avec cette stratégie (10h/jour, 5j/semaine), le coût EC2 passe à environ **~120 EUR/mois**, soit un total d'environ **~155 EUR/mois**.

---

## Détruire l'infrastructure

Si vous souhaitez supprimer toutes les ressources AWS (attention, cette action est irréversible) :

```bash
cd ejb-client-modernizer/deploy/terraform
terraform destroy
```

Tapez **`yes`** pour confirmer. Toutes les ressources seront supprimées et la facturation s'arrêtera.
