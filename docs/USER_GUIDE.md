# Guide Utilisateur — EJB-to-REST Generator

**Version** : 3.0 | **Compleo** | Mars 2026

---

## 1. Introduction

Ce guide explique comment utiliser l'outil EJB-to-REST Generator pour transformer un projet Java EJB en une API REST Spring Boot 3.2. L'outil supporte deux modes d'utilisation : l'interface web et la ligne de commande (CLI).

---

## 2. Preparation du projet EJB source

### 2.1 Format attendu

Le projet EJB source doit etre fourni sous forme d'archive **ZIP** contenant la structure Maven standard :

```
projet-ejb.zip
└── projet-ejb/
    ├── pom.xml
    └── src/
        └── main/
            └── java/
                └── com/bank/...
                    ├── usecase/
                    │   ├── SimulerCreditUseCase.java
                    │   └── ConsulterCompteUseCase.java
                    ├── vo/
                    │   ├── SimulerCreditVoIn.java
                    │   └── SimulerCreditVoOut.java
                    └── exception/
                        └── CompteInexistantException.java
```

### 2.2 Fichiers optionnels

| Fichier | Emplacement | Description |
|---------|-------------|-------------|
| `bian-mapping.yml` | Racine du ZIP | Mapping explicite UseCase → Service Domain BIAN |
| `custom-annotations.yml` | Racine du ZIP | Declaration des annotations bancaires internes |

### 2.3 Exemple de bian-mapping.yml

```yaml
mappings:
  - useCase: SimulerCreditUseCase
    serviceDomain: consumer-loan
    action: initiation
    behaviorQualifier: simulation
  - useCase: ConsulterCompteUseCase
    serviceDomain: current-account
    action: retrieval
```

### 2.4 Exemple de custom-annotations.yml

```yaml
annotations:
  - name: "@AuditLog"
    category: AUDIT
    propagation: PROPAGATE_METHOD
    spring-equivalent: "@Audited"
  - name: "@ChannelRestricted"
    category: CHANNEL
    propagation: TRANSFORM
    spring-equivalent: "@PreAuthorize(\"hasAuthority('CHANNEL_WEB')\")"
```

---

## 3. Utilisation via l'interface web

### 3.1 Demarrage du serveur

```bash
java -jar target/ejb-to-rest-tool-1.0-SNAPSHOT.jar
```

L'interface est accessible sur [http://localhost:8080](http://localhost:8080).

### 3.2 Etape 1 : Upload

1. Cliquer sur **Importer un projet**
2. Selectionner le fichier ZIP du projet EJB
3. Attendre la confirmation de l'upload

### 3.3 Etape 2 : Analyse

1. Cliquer sur **Analyser**
2. L'outil detecte automatiquement :
   - Les EJB (@Stateless, @Stateful, @MessageDriven)
   - Les DTOs (VoIn, VoOut, DTO)
   - Les annotations JAXB (@XmlRootElement, @XmlElement, etc.)
   - Les annotations custom bancaires
   - Les enums, exceptions et validateurs
3. Un resume de l'analyse s'affiche

### 3.4 Etape 3 : Generation

1. Cocher **Mode BIAN** si le projet doit etre conforme BIAN
2. Cliquer sur **Generer**
3. Le pipeline execute :
   - Generation du projet Spring Boot
   - Application des 118 regles SmartCodeEnhancer
   - Resolution des imports (Phase 8)
4. Le score de qualite s'affiche (objectif : 100/100)

### 3.5 Etape 4 : Telechargement

1. Cliquer sur **Telecharger le ZIP**
2. Le ZIP contient :
   - Le projet Spring Boot complet
   - `TRANSFORMATION_SUMMARY.md`
   - `README.md`
   - `ENHANCEMENT_REPORT.md`
   - `BIAN_MAPPING.md` (si mode BIAN)
   - `CUSTOM_ANNOTATIONS_REPORT.md` (si annotations custom detectees)

---

## 4. Utilisation via CLI

### 4.1 Syntaxe

```bash
java -jar ejb-to-rest-tool.jar --cli [options]
```

### 4.2 Options

| Option | Obligatoire | Description |
|--------|-------------|-------------|
| `--cli` | Oui | Active le mode ligne de commande |
| `--input <path>` | Oui | Chemin vers le ZIP du projet EJB source |
| `--output <path>` | Non | Repertoire de sortie (defaut : `./output`) |
| `--bian` | Non | Active le mode BIAN |
| `--pdf` | Non | Genere un rapport PDF |

### 4.3 Exemple complet

```bash
java -jar ejb-to-rest-tool.jar \
  --cli \
  --input /projets/boa-ejb.zip \
  --output /projets/boa-rest \
  --bian \
  --pdf
```

---

## 5. Structure du projet genere

```
generated-api/
├── pom.xml
├── README.md
├── TRANSFORMATION_SUMMARY.md
├── ENHANCEMENT_REPORT.md
├── src/main/java/com/bank/api/
│   ├── Application.java
│   ├── api/                    # Couche API (ACL)
│   │   ├── controller/         # Controllers REST BIAN
│   │   └── dto/
│   │       ├── request/        # Request DTOs
│   │       ├── response/       # Response DTOs
│   │       └── mapper/         # Mappers Request↔EJB
│   ├── domain/                 # Couche Domain
│   │   ├── model/              # Modeles metier
│   │   ├── service/            # Interfaces de service
│   │   └── exception/          # Exceptions metier
│   ├── infrastructure/         # Couche Infrastructure
│   │   └── ejb/
│   │       ├── adapter/        # JndiAdapter + MockAdapter
│   │       └── types/          # Types EJB (VoIn/VoOut)
│   ├── config/                 # Configuration Spring
│   ├── validation/             # Validateurs custom
│   └── filter/                 # Filtres HTTP (BIAN headers)
│   └── enums/                  # Enums metier
└── src/main/resources/
    └── application.properties
```

---

## 6. Configuration du projet genere

### 6.1 application.properties

```properties
server.port=8081
ejb.jndi.provider-url=t3://localhost:7001
ejb.jndi.factory=weblogic.jndi.WLInitialContextFactory
spring.profiles.active=mock
```

### 6.2 Profils Spring

| Profil | Description |
|--------|-------------|
| `mock` | Utilise les MockAdapters (pas de serveur EJB requis) |
| `jndi` | Utilise les JndiAdapters (connexion au serveur EJB reel) |

---

## 7. Verification post-generation

### 7.1 Compilation

```bash
cd generated-api
mvn clean compile
```

### 7.2 Demarrage en mode mock

```bash
mvn spring-boot:run -Dspring.profiles.active=mock
```

### 7.3 Test avec cURL

```bash
# Exemple : simuler un credit
curl -X POST http://localhost:8081/api/v1/consumer-loan/simulation/initiation \
  -H "Content-Type: application/json" \
  -d '{"montant": 100000, "duree": 240}'
```

### 7.4 Swagger UI

Acceder a [http://localhost:8081/swagger-ui.html](http://localhost:8081/swagger-ui.html) pour explorer l'API.

---

## 8. Depannage

| Probleme | Solution |
|----------|----------|
| Score < 100/100 | Verifier le ENHANCEMENT_REPORT.md pour les regles echouees |
| Erreur de compilation | Verifier les imports dans les fichiers generes |
| MockAdapter retourne null | Verifier que le profil `mock` est actif |
| JNDI lookup echoue | Verifier `ejb.jndi.provider-url` et le serveur EJB |
| Annotations custom ignorees | Ajouter les declarations dans `custom-annotations.yml` |

---

## 9. Support

Pour toute question ou probleme, contacter l'equipe Compleo.
