# Changelog

Toutes les modifications notables de ce projet sont documentees dans ce fichier.
Le format est base sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [2.1.0] - 2026-04-07

### Nettoyage dette technique

#### Centralisation utilitaires
- Centralisation de `toKebabCase()`, `toPascalCase()`, `capitalize()` dans `CodeGenUtils`
- Suppression de 8 copies privees dupliquees dans BianMappingResolver, AclArchitectureGenerator, EjbProjectParser, BianMapping, OpenApiClientGenerator, WsdlClientGenerator, OpenApiContractParser

#### Suppression code mort
- Suppression de `replaceFrameworkType()`, `resolveParameterAnnotation()`, `generateBaseUseCaseInterface()`, `generateValueObjectInterface()` dans CodeGenerationEngine
- Reduction de CodeGenerationEngine de 2191 a 2050 lignes

#### Logging
- Remplacement de tous les `System.err.println` par `log.error()` (SLF4J)
- Zero occurrence de System.out/System.err dans le code source

#### Gestion des exceptions
- Remplacement de 8 `catch(Exception)` generiques par `catch(IOException | RuntimeException)` specifiques
- Ajout de messages d'erreur contextuels dans les blocs catch

#### Interfaces SOLID
- Creation de `ProjectParser` (interface pour EjbProjectParser)
- Creation de `CodeGenerator` (interface pour CodeGenerationEngine)
- Creation de `CodeEnhancer` (interface pour SmartCodeEnhancer)
- Creation de `TransformationReportGenerator` (interface pour ReportPdfGenerator)

#### Constantes
- Ajout des constantes Spring imports (`IMPORT_RESPONSE_ENTITY`, `IMPORT_HTTP_STATUS`, etc.)
- Ajout des constantes de structure projet (`SRC_MAIN_JAVA`, `POM_XML`, etc.)
- Ajout de la table `JAVAX_TO_JAKARTA` pour la migration javax vers jakarta

#### Builders
- Creation de `UseCaseInfoBuilder` (builder fluent pour UseCaseInfo)
- Creation de `DtoInfoBuilder` (builder fluent pour DtoInfo)

#### Tests
- Ajout de `GeneratorConstantsTest` (12 tests)
- Ajout de `ImpactAnalysisReportTest` (5 tests)
- Total : 154 tests (137 avant, +17 nouveaux), 0 failures

#### Javadoc
- Ajout de Javadoc complete sur les 10 classes principales

## [2.0.0] - 2026-04-07

### Compleo v2

#### Multi-framework
- Support Java EE standard (@Stateless + @Remote multi-methodes)
- Support Spring Legacy (@Service + @Transactional)
- Detection automatique configurable via `FrameworkDetector`
- Ajout de `SPRING_LEGACY` dans l'enum `EjbType`

#### Dashboard Bootstrap 5
- 5 nouveaux ecrans : Cartographie, Conformite, Documentation, Historique, A propos
- Layout refait en Bootstrap 5 avec sidebar responsive

#### Cartographie Legacy
- `LegacyCartographer` : analyse du patrimoine applicatif
- `CartographyReport` : graphe Mermaid et vis.js interactif

#### Conformite reglementaire
- `AuditTrailGenerator` : generation du composant d'audit trail
- `DataMaskerGenerator` : masquage des donnees sensibles
- `SecurityHeadersGenerator` : generation des headers de securite
- `ComplianceReportGenerator` : rapport PDF de conformite

#### Integration DevOps
- `scripts/install.sh` : installation on-premises
- `scripts/update.sh` : mise a jour automatique

#### Tests
- `FrameworkDetectorTest` (7 tests)
- `LegacyCartographerTest` (6 tests)
- `ComplianceTest` (7 tests)
- `BianAutoDetectorTest` (5 tests)

## [1.0.0] - 2026-04-06

### Version initiale
- Generateur EJB-to-REST avec architecture ACL
- Support BIAN v12
- SmartCodeEnhancer avec 118 regles
- Interface web Thymeleaf
- 108 tests unitaires et d'integration
