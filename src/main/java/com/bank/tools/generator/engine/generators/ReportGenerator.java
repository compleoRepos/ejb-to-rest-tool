package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.annotation.AnnotationPropagator;
import com.bank.tools.generator.annotation.DetectedAnnotation;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.engine.BianServiceDomainMapper;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Genere les rapports Markdown du projet (TRANSFORMATION_SUMMARY, README,
 * BIAN_MAPPING, CUSTOM_ANNOTATIONS_REPORT).
 * Extrait de CodeGenerationEngine pour respecter SRP.
 */
@Component
public class ReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(ReportGenerator.class);

    /**
     * Genere le resume de transformation EJB → REST.
     */
    public void generateTransformationSummary(Path projectRoot, ProjectAnalysisResult analysisResult, boolean hasXml) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Resume de la transformation EJB → REST API\n\n");

        sb.append("## Projet source\n");
        sb.append("- Package source : ").append(analysisResult.getSourceBasePackage() != null ? analysisResult.getSourceBasePackage() : "detecte automatiquement").append("\n");
        sb.append("- EJB detectes : ").append(analysisResult.getUseCases().size()).append("\n");
        sb.append("- DTOs detectes : ").append(analysisResult.getDtos().size()).append("\n");
        sb.append("- Entites JPA : ").append(analysisResult.getJpaEntityCount()).append("\n\n");

        sb.append("## Projet genere\n");
        sb.append("- Framework : Spring Boot 3.2.5\n");
        sb.append("- Package : com.bank.api\n");
        sb.append("- Java : 21\n");
        sb.append("- Support XML/JAXB : ").append(hasXml ? "Oui" : "Non").append("\n\n");

        sb.append("## Mapping detaille\n\n");
        sb.append("| EJB Source | Type | Pattern | Endpoint REST | Methode | Code HTTP |\n");
        sb.append("|------------|------|---------|---------------|---------|----------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            String httpMethod = resolveHttpMethod(uc.getClassName());
            String statusCode = resolveStatusCode(uc.getClassName());
            sb.append("| ").append(uc.getClassName())
              .append(" | @").append(uc.getEjbType() != null ? uc.getEjbType().name() : "Stateless")
              .append(" | ").append(uc.getEjbPattern() != null ? uc.getEjbPattern().name() : "BASE_USE_CASE")
              .append(" | ").append(uc.getRestEndpoint())
              .append(" | ").append(httpMethod)
              .append(" | ").append(statusCode)
              .append(" |\n");
        }

        sb.append("\n## Conversions appliquees\n\n");
        sb.append("- javax.xml.bind → jakarta.xml.bind (G3)\n");
        sb.append("- @EJB → lookup JNDI via ServiceAdapter\n");
        sb.append("- @XmlRootElement → preserve + ajout @JacksonXmlRootElement\n");
        sb.append("- serialVersionUID → supprime des DTOs (inutile en REST)\n");
        sb.append("- Lombok → supprime (getters/setters generes explicitement)\n");
        sb.append("- Swagger/OpenAPI 3 → ajoute sur tous les endpoints (G11)\n\n");

        sb.append("## Points d'attention\n\n");
        long statefulCount = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        long mdbCount = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();
        if (statefulCount > 0) {
            sb.append("- ").append(statefulCount).append(" EJB @Stateful detecte(s) — l'etat conversationnel n'est pas reproduit dans la facade REST\n");
        }
        if (mdbCount > 0) {
            sb.append("- ").append(mdbCount).append(" EJB @MessageDriven detecte(s) → transforme(s) en Controller REST async + EventListener Spring\n");
        }
        sb.append("- Les ServiceAdapters utilisent un lookup JNDI a chaque appel — prevoir un cache si necessaire\n");
        sb.append("- Les tests unitaires mockent les ServiceAdapters — les tests d'integration necessitent un serveur EJB\n");

        // Section BIAN
        long bianMapped = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null).count();
        if (bianMapped > 0) {
            appendBianSection(sb, analysisResult, bianMapped);
        }

        Files.writeString(projectRoot.resolve("TRANSFORMATION_SUMMARY.md"), sb.toString());
        log.info("TRANSFORMATION_SUMMARY.md genere");
    }

    /**
     * Genere le README.md du projet.
     */
    public void generateReadme(Path projectRoot, ProjectAnalysisResult analysisResult, boolean hasXml) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Generated REST API\n\n");
        sb.append("API REST generee automatiquement a partir d'un projet EJB.\n\n");
        sb.append("## Prerequis\n\n");
        sb.append("- Java 21\n- Maven 3.8+\n- Serveur d'applications EJB accessible via JNDI\n\n");
        sb.append("## Compilation et execution\n\n");
        sb.append("```bash\nmvn clean package\njava -jar target/generated-rest-api-1.0.0-SNAPSHOT.jar\n```\n\n");
        sb.append("## Documentation API (Swagger)\n\n");
        sb.append("Apres le demarrage, acceder a :\n");
        sb.append("- Swagger UI : http://localhost:8081/swagger-ui.html\n");
        sb.append("- OpenAPI JSON : http://localhost:8081/api-docs\n\n");

        sb.append("## Endpoints REST\n\n");
        sb.append("| UseCase | Endpoint | Methode | Format | HTTP Status |\n");
        sb.append("|---------|----------|---------|--------|-------------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                sb.append("| ").append(uc.getClassName()).append(" (MDB)")
                  .append(" | ").append(uc.getRestEndpoint())
                  .append(" | POST (async) | JSON | 202 Accepted |\n");
            } else {
                sb.append("| ").append(uc.getClassName())
                  .append(" | ").append(uc.getRestEndpoint())
                  .append(" | ").append(resolveHttpMethod(uc.getClassName()))
                  .append(" | ").append(uc.getSerializationFormat().getLabel())
                  .append(" | ").append(resolveStatusCode(uc.getClassName()))
                  .append(" |\n");
            }
        }

        if (hasXml) {
            sb.append("\n## Negociation de contenu\n\n");
            sb.append("- En-tete Accept : `application/json` ou `application/xml`\n");
            sb.append("- Parametre : `?format=json` ou `?format=xml`\n");
        }

        sb.append("\n## Architecture\n\n");
        sb.append("```\nClient HTTP → Controller REST → ServiceAdapter → JNDI Lookup → EJB\n```\n");

        Files.writeString(projectRoot.resolve("README.md"), sb.toString());
        log.info("README.md genere");
    }

    /**
     * Genere le rapport BIAN_MAPPING.md.
     */
    public void generateBianMappingReport(Path projectRoot,
                                           List<BianServiceDomainMapper.BianMapping> bianMappings,
                                           ProjectAnalysisResult analysisResult) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Rapport de Mapping BIAN\n\n");
        sb.append("Ce document detaille le mapping entre les EJB source et les Service Domains BIAN.\n\n");
        sb.append("**Reference** : BIAN Semantic API Practitioner Guide V8.1\n\n---\n\n");

        sb.append("## Resume\n\n");
        sb.append("| Metrique | Valeur |\n|----------|--------|\n");
        sb.append("| Service Domains identifies | ").append(bianMappings.size()).append(" |\n");
        int totalRoutes = bianMappings.stream().mapToInt(m -> m.methodMappings.size()).sum();
        sb.append("| Routes BIAN generees | ").append(totalRoutes).append(" |\n");
        sb.append("| UseCases totaux | ").append(analysisResult.getUseCases().size()).append(" |\n\n");

        sb.append("## Detail par Service Domain\n\n");
        for (BianServiceDomainMapper.BianMapping mapping : bianMappings) {
            sb.append("### ").append(mapping.serviceDomain.displayName).append("\n\n");
            sb.append("| Propriete | Valeur |\n|-----------|--------|\n");
            sb.append("| **Domain Name** | ").append(mapping.serviceDomain.domainName).append(" |\n");
            sb.append("| **Control Record** | ").append(mapping.serviceDomain.controlRecord).append(" |\n");
            sb.append("| **Functional Pattern** | ").append(mapping.serviceDomain.functionalPattern).append(" |\n");
            sb.append("| **Base URL** | `").append(mapping.baseUrl).append("` |\n\n");

            sb.append("#### Routes\n\n");
            sb.append("| Methode EJB | Action Term | HTTP | URL BIAN | Behavior Qualifier |\n");
            sb.append("|-------------|-------------|------|----------|-------------------|\n");
            for (BianServiceDomainMapper.BianMethodMapping mm : mapping.methodMappings.values()) {
                sb.append("| `").append(mm.methodName).append("` | ").append(mm.actionTerm.actionTerm)
                  .append(" | ").append(mm.httpMethod).append(" | `").append(mapping.baseUrl).append(mm.fullUrl)
                  .append("` | ").append(mm.behaviorQualifier != null ? mm.behaviorQualifier : "-").append(" |\n");
            }
            sb.append("\n");
        }

        sb.append("## Glossaire BIAN\n\n");
        sb.append("| Terme | Definition |\n|-------|-----------|\n");
        sb.append("| **Service Domain** | Unite fonctionnelle autonome dans l'architecture BIAN |\n");
        sb.append("| **Control Record** | Objet metier principal gere par le Service Domain |\n");
        sb.append("| **Behavior Qualifier** | Sous-aspect du Control Record (ex: balances, payments) |\n");
        sb.append("| **Action Term** | Verbe standardise BIAN (Initiate, Retrieve, Update, Execute, Control) |\n");
        sb.append("| **Functional Pattern** | Categorisation du comportement du Service Domain (FULFILL, PROCESS, etc.) |\n\n");

        Files.writeString(projectRoot.resolve("BIAN_MAPPING.md"), sb.toString());
    }

    /**
     * Genere le rapport CUSTOM_ANNOTATIONS_REPORT.md.
     */
    public void generateAnnotationReport(Path projectRoot,
                                          AnnotationPropagator.AnnotationReport report,
                                          ProjectAnalysisResult analysisResult) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append(report.toMarkdown());

        sb.append("## Actions Recommandees\n\n");

        if (report.hasUnknownAnnotations()) {
            sb.append("### Annotations Internes Non Declarees\n\n");
            sb.append("Les annotations suivantes proviennent de packages internes de la banque ");
            sb.append("mais ne sont pas declarees dans `custom-annotations.yml`.\n\n");
            sb.append("```yaml\n");
            for (DetectedAnnotation da : report.unknownInternal) {
                sb.append("  - name: \"").append(da.getName()).append("\"\n");
                sb.append("    category: CUSTOM  # A preciser\n");
                sb.append("    description: \"Detectee sur ").append(da.getSourceClassName()).append("\"\n");
                sb.append("    propagation: PROPAGATE_METHOD  # A preciser\n\n");
            }
            sb.append("```\n\n");
        }

        sb.append("### Propagations Effectuees\n\n");
        List<DetectedAnnotation> known = analysisResult.getDetectedCustomAnnotations().stream()
                .filter(DetectedAnnotation::isKnown)
                .collect(Collectors.toList());

        if (!known.isEmpty()) {
            sb.append("| Annotation Source | Classe | Strategie | Code Genere |\n");
            sb.append("|-------------------|--------|-----------|-------------|\n");
            for (DetectedAnnotation da : known) {
                String generated = da.toGeneratedCode();
                sb.append("| `").append(da.getFullExpression()).append("` | ")
                  .append(da.getSourceClassName()).append(" | ")
                  .append(da.getDefinition().getPropagation()).append(" | ")
                  .append("`").append(generated != null ? generated : "IGNORE").append("` |\n");
            }
        } else {
            sb.append("Aucune annotation custom connue detectee.\n");
        }

        Files.writeString(projectRoot.resolve("CUSTOM_ANNOTATIONS_REPORT.md"), sb.toString());
        log.info("[ANNOTATIONS] Rapport CUSTOM_ANNOTATIONS_REPORT.md genere");
    }

    // --- Private helpers ---

    private void appendBianSection(StringBuilder sb, ProjectAnalysisResult analysisResult, long bianMapped) {
        sb.append("\n## Conformite BIAN\n\n");
        sb.append("L'outil a genere des wrappers conformes au standard BIAN v12.0.\n\n");

        sb.append("### Mapping UseCase → Service Domain BIAN\n\n");
        sb.append("| UseCase Source | Service Domain | BIAN ID | Action | BQ | HTTP | URL BIAN |\n");
        sb.append("|---------------|---------------|---------|--------|----|----|----------|\n");
        for (UseCaseInfo uc : analysisResult.getUseCases()) {
            BianMapping bm = uc.getBianMapping();
            if (bm == null) continue;
            sb.append("| ").append(uc.getClassName())
              .append(" | ").append(bm.getServiceDomainTitle())
              .append(" | ").append(bm.getBianId() != null ? bm.getBianId() : "-")
              .append(" | ").append(bm.getAction())
              .append(" | ").append(bm.getBehaviorQualifier() != null ? bm.getBehaviorQualifier() : "-")
              .append(" | ").append(bm.getHttpMethod()).append(" ").append(bm.getHttpStatus())
              .append(" | `").append(bm.buildUrl("/api/v1")).append("` |\n");
        }

        sb.append("\n### Headers HTTP BIAN\n\n");
        sb.append("Le `BianHeaderFilter` injecte automatiquement les headers suivants :\n\n");
        sb.append("| Header | Description |\n|--------|-------------|\n");
        sb.append("| `X-BIAN-Version` | Version du standard BIAN (12.0) |\n");
        sb.append("| `X-BIAN-Service-Domain` | Nom du Service Domain |\n");
        sb.append("| `X-BIAN-Service-Domain-ID` | Identifiant BIAN officiel (SDxxxx) |\n");
        sb.append("| `X-BIAN-Action` | Action BIAN executee |\n");
        sb.append("| `X-BIAN-Behavior-Qualifier` | Behavior Qualifier (si applicable) |\n");

        sb.append("\n### Statistiques BIAN\n\n");
        sb.append("- UseCases mappes : ").append(bianMapped).append("/").append(analysisResult.getUseCases().size()).append("\n");
        long explicit = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null && uc.getBianMapping().isExplicit()).count();
        sb.append("- Mappings explicites (bian-mapping.yml) : ").append(explicit).append("\n");
        sb.append("- Mappings automatiques (par mots-cles) : ").append(bianMapped - explicit).append("\n");

        Map<String, Long> domainCount = analysisResult.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null)
                .collect(Collectors.groupingBy(uc -> uc.getBianMapping().getServiceDomainTitle(), Collectors.counting()));
        sb.append("- Service Domains couverts : ").append(domainCount.size()).append("\n");
        for (Map.Entry<String, Long> entry : domainCount.entrySet()) {
            sb.append("  - ").append(entry.getKey()).append(" : ").append(entry.getValue()).append(" endpoints\n");
        }
    }

    private String resolveHttpMethod(String className) {
        String lower = className.toLowerCase();
        if (lower.contains("creer") || lower.contains("create") || lower.contains("add") || lower.contains("insert")) return "POST";
        if (lower.contains("update") || lower.contains("modifier") || lower.contains("maj")) return "PUT";
        if (lower.contains("delete") || lower.contains("supprimer") || lower.contains("remove")) return "DELETE";
        if (lower.contains("get") || lower.contains("find") || lower.contains("search") || lower.contains("consult") || lower.contains("list") || lower.contains("retrieve")) return "GET";
        return "POST";
    }

    private String resolveStatusCode(String className) {
        String method = resolveHttpMethod(className);
        return switch (method) {
            case "POST" -> "201";
            case "DELETE" -> "204";
            default -> "200";
        };
    }
}
