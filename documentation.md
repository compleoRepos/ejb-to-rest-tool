# Documentation Technique : EJB to REST API Generator

## 1. Introduction

L'outil **EJB to REST API Generator** est une application web developpee en Java 21 et Spring Boot 3. Son objectif principal est d'automatiser la transformation de projets Java EJB (Enterprise JavaBeans) legacy en API REST modernes basees sur Spring Boot.

L'application permet a un utilisateur de telecharger un fichier ZIP contenant le code source d'un projet EJB. L'outil analyse ensuite statiquement le code Java pour detecter les cas d'usage (UseCases), les objets de transfert de donnees (DTOs), les interfaces `@Remote`, les annotations de serialisation (JAXB), et les annotations de validation metier personnalisees (`@ValidIBAN`, `@ValidRIB`, etc.). A partir de cette analyse, il genere un projet Spring Boot complet, pret a etre compile et deploye, exposant les anciens EJB sous forme de points de terminaison REST (endpoints) supportant les formats JSON et XML.

L'outil integre egalement un **moteur d'amelioration intelligent (SmartCodeEnhancer)** qui applique automatiquement les meilleures pratiques de l'industrie au code genere, ainsi qu'un **ImportResolver systemique** qui garantit la coherence de tous les imports Java dans le projet genere.

## 2. Architecture de l'Application

L'application suit une architecture classique en couches (MVC) basee sur le framework Spring Boot.

### 2.1. Couche de Presentation (Web)
L'interface utilisateur est rendue cote serveur a l'aide du moteur de templates **Thymeleaf**.
- **`GeneratorController`** : Gere les requetes HTTP (GET, POST) pour l'affichage de la page d'accueil, l'upload du fichier ZIP, le declenchement de l'analyse, la generation du code et le telechargement du resultat.
- **`ToolExceptionHandler`** : Intercepte les erreurs globales (comme le depassement de la taille maximale d'upload) et redirige l'utilisateur vers l'interface avec un message d'erreur clair.

### 2.2. Couche de Service (Orchestration)
- **`GeneratorService`** : C'est le chef d'orchestre de l'application. Il gere la logique metier de haut niveau :
  - Creation d'un identifiant unique (UUID) pour chaque session de travail.
  - Decompression securisee du fichier ZIP (protection contre les attaques *Zip Slip*).
  - Appel du parseur pour l'analyse du code.
  - Appel du moteur de generation pour creer le nouveau projet.
  - Appel du moteur d'amelioration intelligent (SmartCodeEnhancer) pour optimiser le code genere.
  - Compression du projet genere en un nouveau fichier ZIP pour le telechargement.

### 2.3. Couche d'Analyse Statique (Parsing)
- **`EjbProjectParser`** : Utilise la bibliotheque **JavaParser** pour lire et comprendre le code source Java sans avoir besoin de le compiler.
  - Il parcourt l'arborescence des fichiers extraits.
  - Il detecte les classes annotees avec `@Stateless` ou implementant l'interface `BaseUseCase`.
  - Il identifie les methodes `execute` et deduit les DTOs d'entree et de sortie.
  - Il recherche activement les annotations JAXB (`@XmlRootElement`, `@XmlElement`, etc.) pour determiner si le support XML est requis.
  - Il detecte les interfaces annotees `@Remote` et collecte leur code source complet.
  - Il detecte les annotations de validation metier personnalisees (`@ValidIBAN`, `@ValidRIB`, etc.) sur les champs des DTOs.

### 2.4. Couche de Generation de Code
- **`CodeGenerationEngine`** : Responsable de la creation physique des fichiers du nouveau projet Spring Boot.
  - Genere le fichier `pom.xml` avec les dependances necessaires (incluant JAXB et Jackson XML si detectes).
  - Genere la classe principale `Application.java` et le fichier `application.properties`.
  - Genere les **Controllers REST** (`@RestController`) qui exposent les endpoints avec des URLs RESTful pluralisees.
  - Genere les **Service Adapters** qui effectuent les appels JNDI vers les EJB distants, avec des commentaires de tracabilite EJB complets.
  - Recopie les **interfaces `@Remote`** dans le package `ejb/interfaces/` pour garantir la compilation.
  - Recree les **DTOs** en conservant les annotations JAXB, les annotations de validation metier (`@ValidIBAN`, `@ValidRIB`), et `@XmlTransient` avec `@JsonIgnore`.
  - Genere un `GlobalExceptionHandler` avec un mapping intelligent des exceptions metier vers les codes HTTP (ex: `AccountClosedException` -> 409 Conflict, `UnauthorizedOperationException` -> 403 Forbidden).
  - Genere des classes utilitaires : aspect de journalisation (`LoggingAspect`), et configuration de negociation de contenu (`ContentNegotiationConfig`).
  - Applique une deduplication des routes pour eviter les conflits dans les controllers multi-methodes.
  - Garantit qu'un seul `@RequestBody` est present par methode (les enums et types simples sont annotes `@RequestParam`).
  - Detecte les methodes `generate*` retournant `byte[]` et les expose en `@GetMapping` au lieu de `@PostMapping`.
- **`ImportResolver`** : Phase post-generation (Phase 8) qui scanne tous les fichiers `.java` generes et resout automatiquement les imports manquants (enums, DTOs, exceptions, types Java standard, annotations Spring/Jakarta).

### 2.5. Couche d'Amelioration Intelligente (SmartCodeEnhancer)
- **`SmartCodeEnhancer`** : Moteur de regles interne fonctionnant en local (sans appel externe) qui analyse et modifie le code genere pour le rendre conforme aux standards de l'industrie.
  - Applique **112+ regles** reparties en **12 categories** (Securite, Performance, Observabilite, Tests, etc.).
  - Genere automatiquement des tests unitaires (`@WebMvcTest`) pour chaque controleur.
  - Ajoute la documentation OpenAPI (`@Operation`, `@ApiResponses`).
  - Configure la securite (CORS, SecurityConfig) et la resilience (Actuator, profils dev/prod).
  - Preserve `@XmlTransient` et ajoute `@JsonIgnore` en complement (sans remplacement).
  - Produit un rapport detaille (`ENHANCEMENT_REPORT.md`) avec un score de qualite sur 100.
- **`RulesCatalog`** : Catalogue de regles qui enrichit chaque amelioration avec une justification detaillee, l'action realisee, des extraits de code avant/apres, et une reference normative (RFC, Google API Guidelines, etc.).

## 3. Modeles de Donnees

L'analyse du code source produit un modele de donnees interne structure :

- **`ProjectAnalysisResult`** : Contient le bilan global de l'analyse (nombre de fichiers, liste des UseCases, liste des DTOs, avertissements, interfaces `@Remote` detectees).
- **`UseCaseInfo`** : Represente un EJB detecte. Contient son nom, ses DTOs associes, le nom du endpoint REST genere, et le format de serialisation supporte (JSON, XML, ou les deux).
- **`DtoInfo`** : Represente un objet de transfert. Contient la liste de ses champs (avec annotations de validation metier personnalisees) et un indicateur de presence d'annotations JAXB.
- **`EnhancementReport`** : Contient le bilan des ameliorations appliquees par le SmartCodeEnhancer, incluant le score de qualite, le detail par regle avec justification, action realisee, extraits avant/apres, et reference normative.

## 4. Flux de Traitement (Workflow)

1. **Upload** : L'utilisateur soumet un fichier `.zip`. Le `GeneratorService` le decompresse dans un repertoire temporaire defini par `app.upload.dir`.
2. **Scan** : L'utilisateur clique sur "Scanner". Le `EjbProjectParser` lit les fichiers `.java`, remplit le modele `ProjectAnalysisResult`, et l'interface affiche les statistiques.
3. **Generation & Amelioration** : L'utilisateur clique sur "Generer". Le `CodeGenerationEngine` cree l'arborescence du nouveau projet (incluant l'ImportResolver en Phase 8), puis le `SmartCodeEnhancer` l'optimise et genere le rapport enrichi.
4. **Telechargement** : L'utilisateur telecharge le resultat. Le `GeneratorService` zippe le dossier genere et le renvoie via le `GeneratorController`.

---

# Guide d'Installation et d'Utilisation (Pas a Pas)

Ce guide est concu pour vous accompagner pas a pas dans l'installation et le demarrage de l'application. Il est base sur une **experience reelle d'installation** sur un poste de developpement Windows, et documente les problemes concrets rencontres avec leurs solutions.

## Prerequis Systeme

| Composant | Version requise | Verification | Remarque |
|-----------|----------------|--------------|----------|
| Java (JDK) | **21 ou superieur** | `java -version` | Spring Boot 3.2.5 exige Java 17 minimum ; nous recommandons Java 21 |
| Maven | **3.6 ou superieur** | `mvn -version` | Necessaire pour compiler le projet |
| Git | **2.x** | `git --version` | Necessaire pour cloner le depot |
| Navigateur | Chrome, Firefox, Edge | - | Pour acceder a l'interface web |
| Espace disque | 500 Mo minimum | - | Pour le JDK, Maven et le projet |

---

## Etape 1 : Installer Java 21 (JDK)

### 1.1. Verifier la version actuelle de Java

Ouvrez un terminal (PowerShell sur Windows, Terminal sur Mac/Linux) et tapez :

```
java -version
```

**Probleme frequent rencontre** : La machine dispose souvent de Java 8 (version 1.8.x) qui est **incompatible** avec ce projet. Si vous voyez `java version "1.8.0_xxx"`, vous devez installer Java 21.

### 1.2. Installer Java 21 sur Windows

**Methode recommandee : Adoptium (Eclipse Temurin)**

1. Ouvrez PowerShell **en tant qu'administrateur** (clic droit sur PowerShell > "Executer en tant qu'administrateur").

2. Telechargez le JDK 21 :
```powershell
Start-BitsTransfer -Source "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jdk_x64_windows_hotspot_21.0.6_7.msi" -Destination "$env:TEMP\jdk21.msi"
```

3. Installez silencieusement :
```powershell
Start-Process msiexec.exe -ArgumentList "/i `"$env:TEMP\jdk21.msi`" /qn ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome" -Verb RunAs -Wait
```

> **Attention** : Une fenetre de controle de compte utilisateur (UAC) apparaitra. Vous devez cliquer sur **Oui** pour autoriser l'installation. Si vous ne voyez pas la fenetre, verifiez la barre des taches en bas de l'ecran.

4. Verifiez l'installation en **ouvrant un nouveau terminal** (important : fermez et rouvrez PowerShell) :
```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
java -version
```

5. Configurez les variables d'environnement de maniere permanente :
```powershell
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot", "User")
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
[System.Environment]::SetEnvironmentVariable("Path", "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot\bin;$currentPath", "User")
```

> **Note** : Le chemin exact peut varier selon la version installee. Verifiez le dossier reel dans `C:\Program Files\Eclipse Adoptium\`.

### 1.3. Installer Java 21 sur macOS

```bash
brew install openjdk@21
sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 21)' >> ~/.zshrc
source ~/.zshrc
java -version
```

### 1.4. Installer Java 21 sur Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
java -version
```

---

## Etape 2 : Installer Apache Maven

### 2.1. Verifier si Maven est deja installe

```
mvn -version
```

**Probleme frequent rencontre** : Maven n'est souvent pas installe par defaut sur les postes de developpement. La commande retourne `mvn : terme non reconnu` ou `command not found`.

### 2.2. Installer Maven sur Windows

1. Telechargez Maven :
```powershell
Start-BitsTransfer -Source "https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip" -Destination "$env:TEMP\maven.zip"
```

2. Extrayez dans votre dossier utilisateur :
```powershell
Expand-Archive -Path "$env:TEMP\maven.zip" -DestinationPath "$env:USERPROFILE" -Force
```

3. Configurez les variables d'environnement de maniere permanente :
```powershell
$mavenHome = "$env:USERPROFILE\apache-maven-3.9.9"
[System.Environment]::SetEnvironmentVariable("M2_HOME", $mavenHome, "User")
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
[System.Environment]::SetEnvironmentVariable("Path", "$mavenHome\bin;$currentPath", "User")
```

4. **Fermez et rouvrez** votre terminal, puis verifiez :
```powershell
mvn -version
```

> **Resultat attendu** : Vous devez voir `Apache Maven 3.9.9` et la version Java 21 dans la sortie.

### 2.3. Installer Maven sur macOS

```bash
brew install maven
mvn -version
```

### 2.4. Installer Maven sur Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y maven
mvn -version
```

---

## Etape 3 : Recuperer le code source

### 3.1. Methode A : Cloner depuis GitHub (recommande)

```bash
cd C:\Users\VotreNom\Desktop\DEV
git clone https://github.com/compleoRepos/ejb-to-rest-tool.git
cd ejb-to-rest-tool
```

> **Note** : Remplacez `VotreNom` par votre nom d'utilisateur Windows. Si le depot est prive, Git vous demandera vos identifiants GitHub.

### 3.2. Methode B : A partir d'un fichier ZIP

1. Telechargez le fichier ZIP du projet.
2. Extrayez-le dans un dossier de votre choix (ex: `C:\Users\VotreNom\Desktop\DEV\`).
3. Ouvrez un terminal et naviguez vers le dossier extrait :
```
cd C:\Users\VotreNom\Desktop\DEV\ejb-to-rest-tool
```

---

## Etape 4 : Compiler le projet

> **Important** : Assurez-vous que `JAVA_HOME` pointe vers Java 21 et que Maven est dans le PATH. Si vous venez d'installer Java et Maven, **fermez et rouvrez votre terminal** pour que les variables d'environnement soient prises en compte.

1. Verifiez votre environnement :
```powershell
# Sur Windows PowerShell - configurez les variables pour cette session
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:USERPROFILE\apache-maven-3.9.9\bin;$env:PATH"

# Verifiez
java -version
mvn -version
```

2. Compilez et packagez le projet :
```
mvn clean package -DskipTests
```

3. **Patientez** : La premiere compilation peut prendre 2 a 5 minutes car Maven telecharge les dependances. Vous verrez beaucoup de texte defiler.

4. **Resultat attendu** : A la fin, vous devez voir :
```
[INFO] BUILD SUCCESS
[INFO] Total time: ...
```

**Problemes frequents** :

| Probleme | Cause | Solution |
|----------|-------|----------|
| `BUILD FAILURE` avec `invalid source release: 21` | JAVA_HOME pointe vers Java 8 | Verifiez `$env:JAVA_HOME` et corrigez-le |
| `mvn : terme non reconnu` | Maven pas dans le PATH | Ajoutez le dossier `bin` de Maven au PATH |
| Erreur de telechargement de dependances | Proxy d'entreprise | Configurez le proxy dans `~/.m2/settings.xml` |
| `OutOfMemoryError` pendant le build | Memoire insuffisante | Ajoutez `set MAVEN_OPTS=-Xmx1024m` avant la commande |

---

## Etape 5 : Lancer l'application

1. Depuis le dossier du projet, lancez l'application :
```
java -jar target/ejb-to-rest-generator-1.0.0.jar
```

2. Vous verrez le logo Spring Boot apparaitre, suivi de lignes d'informations.

3. L'application est prete lorsque vous voyez :
```
Started EjbToRestGeneratorApplication in X.XXX seconds
```

4. **Ne fermez pas cette fenetre !** Reduisez-la simplement dans la barre des taches.

> **Astuce** : Pour lancer l'application en arriere-plan sur Windows :
> ```powershell
> Start-Process java -ArgumentList "-jar", "target/ejb-to-rest-generator-1.0.0.jar" -NoNewWindow -RedirectStandardOutput "$env:TEMP\app-stdout.log" -RedirectStandardError "$env:TEMP\app-stderr.log"
> ```

---

## Etape 6 : Utiliser l'application

### 6.1. Acceder a l'interface

1. Ouvrez votre navigateur (Chrome, Firefox, Edge).
2. Tapez dans la barre d'adresse : **`http://localhost:8080`**
3. Appuyez sur Entree.
4. La page d'accueil de l'outil s'affiche avec 4 etapes numerotees.

### 6.2. Etape 1 - Uploader le projet EJB

1. Repérez la section **"1. Upload du projet EJB"**.
2. Vous avez deux possibilites :
   - **Glisser-deposer** : Prenez votre fichier `.zip` et deposez-le dans la zone en pointilles.
   - **Cliquer** : Cliquez sur la zone pour ouvrir l'explorateur de fichiers.
3. Le nom du fichier s'affiche en bleu.
4. Cliquez sur le bouton bleu **"Uploader le projet"**.
5. Un badge vert "Projet uploade" confirme le succes.

> **Format attendu** : Le fichier ZIP doit contenir le code source Java du projet EJB avec les fichiers `.java` dans une arborescence standard (`src/main/java/...`).

### 6.3. Etape 2 - Scanner le projet

1. Cliquez sur le bouton gris **"Scanner le projet EJB"**.
2. L'outil analyse le code en quelques secondes.
3. Un tableau de bord s'affiche avec :
   - **Fichiers analyses** : Nombre total de fichiers Java lus.
   - **UseCases detectes** : Nombre de fonctionnalites principales trouvees.
   - **DTOs detectes** : Nombre d'objets de donnees trouves.
   - **Interfaces @Remote** : Nombre d'interfaces distantes detectees.
4. Des badges colores indiquent les formats detectes (JSON en bleu, XML en jaune).

### 6.4. Etape 3 - Generer et ameliorer

1. Cliquez sur le bouton vert **"Generer et ameliorer avec l'IA"**.
2. L'outil travaille pendant quelques secondes (generation + 8 phases d'amelioration).
3. Une section violette **"Rapport d'amelioration IA"** apparait avec :
   - **Un score sur 100** : Note de qualite globale du code genere.
   - **Nombre de regles appliquees** : Combien d'ameliorations ont ete apportees.
   - **Nombre de regles avec details** : Combien de regles ont une justification complete.
4. **Nouveau** : Cliquez sur une ligne du tableau pour deployer le **detail complet** de chaque regle :
   - **Pourquoi cette regle ?** : Justification technique.
   - **Action realisee** : Ce qui a ete modifie concretement.
   - **Avant / Apres** : Extraits de code montrant la transformation.
   - **Reference normative** : RFC, Google API Guidelines, etc.
5. Utilisez les boutons **"Tout deployer"** / **"Tout replier"** pour naviguer facilement.
6. Filtrez par categorie via le menu deroulant.

### 6.5. Etape 4 - Telecharger le resultat

1. Cliquez sur le bouton violet **"Telecharger le projet API genere (ZIP)"**.
2. Un fichier `.zip` se telecharge contenant :
   - Le projet Spring Boot complet (pret a compiler avec `mvn clean package`).
   - Un fichier `ENHANCEMENT_REPORT.md` avec le rapport detaille de toutes les ameliorations.
   - Les interfaces `@Remote` dans le package `ejb/interfaces/`.
   - Les DTOs avec annotations de validation metier preservees.

### 6.6. Recommencer

Cliquez sur le bouton **"Reinitialiser"** en bas de page pour traiter un autre projet.

---

## Etape 7 : Arreter l'application

1. Retournez sur la fenetre du terminal.
2. Appuyez sur **Ctrl + C**.
3. L'application s'arrete proprement.

---

## Depannage

### Problemes d'installation

| Symptome | Cause probable | Solution |
|----------|---------------|----------|
| `java -version` affiche Java 8 | JAVA_HOME pointe vers l'ancien JDK | Mettez a jour JAVA_HOME vers le dossier JDK 21 |
| `mvn : terme non reconnu` | Maven pas dans le PATH | Ajoutez `apache-maven-3.9.9\bin` au PATH |
| La fenetre UAC n'apparait pas | Elle est cachee derriere d'autres fenetres | Verifiez la barre des taches |
| `BUILD FAILURE` | Java ou Maven mal configure | Executez `java -version` et `mvn -version` pour verifier |
| Le premier build est tres long | Telechargement des dependances Maven | Normal, les builds suivants seront plus rapides |

### Problemes d'utilisation

| Symptome | Cause probable | Solution |
|----------|---------------|----------|
| Page blanche sur `localhost:8080` | L'application n'est pas demarree | Verifiez que le terminal affiche "Started..." |
| Erreur "Fichier trop volumineux" | ZIP depasse la limite (50 Mo par defaut) | Reduisez la taille du ZIP ou modifiez `application.properties` |
| Le scan ne detecte rien | Le ZIP ne contient pas de fichiers `.java` | Verifiez la structure du ZIP (doit contenir `src/main/java/`) |
| Score < 100 | Certaines regles non applicables au projet | Normal, le score depend du contenu du projet EJB |

### Configuration avancee

Le fichier `application.properties` (dans `src/main/resources/`) permet de personnaliser :

```properties
# Port du serveur (defaut: 8080)
server.port=8080

# Taille maximale d'upload (defaut: 50 Mo)
spring.servlet.multipart.max-file-size=50MB
spring.servlet.multipart.max-request-size=50MB

# Repertoires de travail
app.upload.dir=${java.io.tmpdir}/ejb-to-rest-uploads
app.output.dir=${java.io.tmpdir}/ejb-to-rest-output
```

---

## Contenu du projet genere

Le projet Spring Boot genere contient l'arborescence suivante :

```
generated-api/
  pom.xml                          # Dependances Maven (Spring Boot, Jackson, JAXB, etc.)
  src/main/java/com/bank/api/
    Application.java               # Point d'entree Spring Boot
    controller/                    # Controllers REST (@RestController)
    service/                       # Service Adapters (appels JNDI)
    dto/                           # DTOs avec annotations JAXB et validation
    ejb/interfaces/                # Interfaces @Remote recopiees
    config/                        # Configuration (CORS, Content Negotiation, Security)
    exception/                     # GlobalExceptionHandler
    aspect/                        # LoggingAspect
  src/main/resources/
    application.properties         # Configuration Spring Boot (profils dev/prod)
  src/test/java/                   # Tests unitaires generes (@WebMvcTest)
  ENHANCEMENT_REPORT.md            # Rapport detaille des ameliorations IA
```

---

*Fin de la documentation.*
