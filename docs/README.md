# EJB-to-REST Generator

**Version** : 3.0  
**Compleo | Mars 2026**

## Presentation

L'outil **EJB-to-REST Generator** transforme automatiquement un projet Java EJB en une API REST Spring Boot 3.2 conforme aux standards BIAN v12.0. Il analyse le code source EJB, detecte les patterns (BaseUseCase, multi-methodes, MDB), et genere un projet Spring Boot complet avec architecture ACL (Anti-Corruption Layer) decouplée.

## Fonctionnalites principales

| Fonctionnalite | Description |
|----------------|-------------|
| **Analyse EJB** | Detection automatique des @Stateless, @Stateful, @MessageDriven, patterns BaseUseCase et multi-methodes |
| **Generation REST** | Controllers Spring Boot, DTOs, ServiceAdapters, configuration, exception handlers |
| **Conformite BIAN** | Mapping automatique vers les Service Domains BIAN, URLs conformes, headers X-BIAN-* |
| **Architecture ACL** | 4 couches decouplées : API, Domain, Infrastructure, Application |
| **SmartCodeEnhancer** | 118 regles d'amelioration IA post-generation |
| **Annotations custom** | Detection et propagation des annotations bancaires internes |
| **Mode CLI** | Execution en ligne de commande sans interface web |
| **Rapport PDF** | Generation automatique d'un rapport de transformation |

## Prerequis

- **Java** : 21+
- **Maven** : 3.8+
- **Spring Boot** : 3.2.5 (inclus)

## Demarrage rapide

### Mode Web (par defaut)

```bash
mvn clean package
java -jar target/ejb-to-rest-tool-1.0-SNAPSHOT.jar
```

Acceder a l'interface : [http://localhost:8080](http://localhost:8080)

### Mode CLI

```bash
java -jar target/ejb-to-rest-tool-1.0-SNAPSHOT.jar \
  --cli \
  --input /chemin/vers/projet-ejb.zip \
  --output /chemin/vers/sortie \
  --bian
```

## Workflow de generation

```
1. Upload    →  ZIP du projet EJB source
2. Analyse   →  Detection des patterns, DTOs, annotations
3. Generation →  Projet Spring Boot complet
4. Enhancement → 118 regles SmartCodeEnhancer
5. Export     →  ZIP du projet genere + rapports
```

## Architecture du generateur

```
com.bank.tools.generator/
├── controller/          # API REST du generateur (upload, scan, generate)
├── service/             # Orchestration du pipeline
├── parser/              # Analyse du code EJB source
├── engine/              # Moteur de generation
│   ├── generators/      # Generateurs specialises (POM, Config, DTO, Controller, etc.)
│   ├── constants/       # Constantes et patterns
│   └── util/            # Utilitaires de generation
├── bian/                # Mapping et resolution BIAN
├── annotation/          # Detection et propagation des annotations custom
├── ai/                  # SmartCodeEnhancer (amelioration IA)
├── cli/                 # Mode ligne de commande
└── report/              # Generation de rapports PDF
```

## Documentation complementaire

- [Guide utilisateur](USER_GUIDE.md) — Instructions detaillees d'utilisation
- [Patterns supportes](SUPPORTED_PATTERNS.md) — Catalogue des patterns EJB reconnus
- [Guide BIAN](BIAN_GUIDE.md) — Conformite BIAN et mapping des Service Domains
- [Documentation technique](documentation-technique-ejb-to-rest.md) — Architecture interne detaillee

## Tests

```bash
# Tous les tests
mvn test

# Tests unitaires uniquement
mvn test -Dtest="*Test" -DexcludedGroups=integration

# Tests d'integration
mvn test -Dtest="*PipelineTest"

# Couverture
mvn test jacoco:report
```

## Licence

Propriete de Compleo — Usage interne uniquement.
