package com.bank.tools.generator.report;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Genere un rapport d'analyse d'impact de la transformation EJB → REST.
 *
 * Le rapport couvre :
 * - Impact sur les interfaces (contrats de service)
 * - Impact sur les DTOs (serialisation, validation)
 * - Impact sur la securite (roles, annotations)
 * - Impact sur les transactions et la concurrence
 * - Impact sur les dependances et le deploiement
 * - Risques identifies et recommandations
 * - Matrice de complexite par UseCase
 */
@Component
public class ImpactAnalysisReport {

    private static final Logger log = LoggerFactory.getLogger(ImpactAnalysisReport.class);

    /**
     * Genere le rapport d'analyse d'impact au format Markdown.
     *
     * @param outputPath Chemin du fichier de sortie (.md)
     * @param analysis   Resultat de l'analyse du projet EJB source
     */
    public void generateReport(Path outputPath, ProjectAnalysisResult analysis) throws IOException {
        StringBuilder sb = new StringBuilder();
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));

        // En-tete
        sb.append("# Rapport d'Analyse d'Impact — Transformation EJB → REST\n\n");
        sb.append("**Date** : ").append(date).append("  \n");
        sb.append("**Generateur** : EJB-to-REST Generator v3.0 — Compleo  \n");
        sb.append("**Package source** : ").append(analysis.getSourceBasePackage() != null ? analysis.getSourceBasePackage() : "auto-detecte").append("\n\n");
        sb.append("---\n\n");

        // 1. Resume executif
        appendExecutiveSummary(sb, analysis);

        // 2. Impact sur les interfaces
        appendInterfaceImpact(sb, analysis);

        // 3. Impact sur les DTOs
        appendDtoImpact(sb, analysis);

        // 4. Impact sur la securite
        appendSecurityImpact(sb, analysis);

        // 5. Impact sur les transactions
        appendTransactionImpact(sb, analysis);

        // 6. Matrice de complexite
        appendComplexityMatrix(sb, analysis);

        // 7. Risques et recommandations
        appendRisksAndRecommendations(sb, analysis);

        // 8. Plan de migration
        appendMigrationPlan(sb, analysis);

        Files.writeString(outputPath, sb.toString());
        log.info("[IMPACT] Rapport d'analyse d'impact genere : {}", outputPath);
    }

    private void appendExecutiveSummary(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 1. Resume Executif\n\n");

        long stateless = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATELESS).count();
        long stateful = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        long mdb = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();
        long multiMethod = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbPattern() == UseCaseInfo.EjbPattern.REMOTE_INTERFACE).count();
        long withRoles = analysis.getUseCases().stream()
                .filter(uc -> uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty()).count();
        long bianMapped = analysis.getUseCases().stream()
                .filter(uc -> uc.getBianMapping() != null).count();

        sb.append("| Metrique | Valeur | Impact |\n");
        sb.append("|----------|--------|--------|\n");
        sb.append("| EJB @Stateless | ").append(stateless).append(" | Faible — transformation directe |\n");
        if (stateful > 0) {
            sb.append("| EJB @Stateful | ").append(stateful).append(" | **Eleve** — perte d'etat conversationnel |\n");
        }
        if (mdb > 0) {
            sb.append("| EJB @MessageDriven | ").append(mdb).append(" | Moyen — migration vers Spring Events |\n");
        }
        sb.append("| DTOs detectes | ").append(analysis.getDtos().size()).append(" | Faible — recopie avec migration javax→jakarta |\n");
        sb.append("| Exceptions custom | ").append(analysis.getDetectedExceptions().size()).append(" | Faible — mapping HTTP automatique |\n");
        sb.append("| Enums | ").append(analysis.getDetectedEnums().size()).append(" | Faible — ajout @JsonCreator/@JsonValue |\n");
        sb.append("| Validateurs custom | ").append(analysis.getDetectedValidators().size()).append(" | Faible — recopie directe |\n");
        if (multiMethod > 0) {
            sb.append("| Multi-methodes | ").append(multiMethod).append(" | Moyen — un endpoint par methode |\n");
        }
        if (withRoles > 0) {
            sb.append("| UseCases avec @RolesAllowed | ").append(withRoles).append(" | Moyen — migration vers @PreAuthorize |\n");
        }
        if (bianMapped > 0) {
            sb.append("| UseCases mappes BIAN | ").append(bianMapped).append(" | Moyen — URLs et headers BIAN |\n");
        }
        sb.append("\n");

        // Score d'impact global
        int impactScore = calculateGlobalImpactScore(analysis);
        String impactLevel = impactScore <= 30 ? "Faible" : impactScore <= 60 ? "Moyen" : "Eleve";
        sb.append("**Score d'impact global** : ").append(impactScore).append("/100 (").append(impactLevel).append(")\n\n");
    }

    private void appendInterfaceImpact(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 2. Impact sur les Interfaces de Service\n\n");

        sb.append("### 2.1 Contrats de service\n\n");
        sb.append("La transformation EJB → REST modifie les contrats de service de la maniere suivante :\n\n");

        sb.append("| Aspect | EJB (avant) | REST (apres) | Impact |\n");
        sb.append("|--------|-------------|--------------|--------|\n");
        sb.append("| Protocole | RMI/IIOP | HTTP/HTTPS | **Rupture** — les clients EJB doivent migrer |\n");
        sb.append("| Serialisation | Java Serialization / JAXB | JSON (Jackson) + XML (JAXB) | Moyen — format de donnees change |\n");
        sb.append("| Decouverte | JNDI Lookup | URL REST | **Rupture** — mecanisme de decouverte change |\n");
        sb.append("| Transactions | JTA (Container-Managed) | Spring @Transactional | Moyen — semantique preservee |\n");
        sb.append("| Securite | @RolesAllowed (JAAS) | @PreAuthorize (Spring Security) | Moyen — roles preserves |\n");
        sb.append("| Etat | @Stateful possible | Stateless (REST) | **Eleve** si @Stateful utilise |\n\n");

        sb.append("### 2.2 Endpoints generes\n\n");
        sb.append("| UseCase | Endpoint REST | HTTP Method | Observations |\n");
        sb.append("|---------|---------------|-------------|---------------|\n");
        for (UseCaseInfo uc : analysis.getUseCases()) {
            String httpMethod = resolveHttpMethod(uc);
            String obs = buildObservations(uc);
            sb.append("| ").append(uc.getClassName())
              .append(" | ").append(uc.getRestEndpoint() != null ? uc.getRestEndpoint() : "-")
              .append(" | ").append(httpMethod)
              .append(" | ").append(obs)
              .append(" |\n");
        }
        sb.append("\n");
    }

    private void appendDtoImpact(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 3. Impact sur les DTOs\n\n");

        long jaxbDtos = analysis.getDtos().stream()
                .filter(DtoInfo::isHasXmlRootElement).count();
        long totalFields = analysis.getDtos().stream()
                .mapToLong(dto -> dto.getFields().size()).sum();

        sb.append("| Metrique | Valeur |\n");
        sb.append("|----------|--------|\n");
        sb.append("| DTOs totaux | ").append(analysis.getDtos().size()).append(" |\n");
        sb.append("| DTOs avec JAXB | ").append(jaxbDtos).append(" |\n");
        sb.append("| Champs totaux | ").append(totalFields).append(" |\n\n");

        sb.append("### 3.1 Modifications appliquees\n\n");
        sb.append("- **Migration javax → jakarta** : toutes les annotations `javax.xml.bind.*` sont migrees vers `jakarta.xml.bind.*`\n");
        sb.append("- **Ajout Jackson** : `@JacksonXmlRootElement` ajoute sur les DTOs JAXB pour le support JSON\n");
        sb.append("- **Validation** : `@NotBlank`, `@NotNull`, `@Size` ajoutes sur les champs `@XmlElement(required=true)`\n");
        sb.append("- **@XmlTransient** : champs exclus des Request/Response DTOs en mode ACL\n");
        sb.append("- **Serializable** : `implements Serializable` preserve sur les VoIn/VoOut\n\n");

        if (jaxbDtos > 0) {
            sb.append("### 3.2 DTOs JAXB detectes\n\n");
            sb.append("| Classe | Champs | @XmlRootElement | @XmlType | @XmlAccessorType |\n");
            sb.append("|--------|--------|-----------------|----------|------------------|\n");
            for (DtoInfo dto : analysis.getDtos()) {
                if (dto.isHasXmlRootElement()) {
                    sb.append("| ").append(dto.getClassName())
                      .append(" | ").append(dto.getFields().size())
                      .append(" | Oui")
                      .append(" | ").append(dto.isHasXmlType() ? "Oui" : "Non")
                      .append(" | ").append(dto.isHasXmlAccessorType() ? "Oui" : "Non")
                      .append(" |\n");
                }
            }
            sb.append("\n");
        }
    }

    private void appendSecurityImpact(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 4. Impact sur la Securite\n\n");

        List<UseCaseInfo> securedUseCases = analysis.getUseCases().stream()
                .filter(uc -> uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty())
                .collect(Collectors.toList());

        if (securedUseCases.isEmpty()) {
            sb.append("Aucune annotation `@RolesAllowed` detectee. La securite devra etre configuree manuellement.\n\n");
            sb.append("**Recommandation** : Ajouter Spring Security avec OAuth2/JWT pour securiser les endpoints REST.\n\n");
        } else {
            sb.append("### 4.1 Migration @RolesAllowed → @PreAuthorize\n\n");
            sb.append("| UseCase | Roles EJB | Annotation Spring generee |\n");
            sb.append("|---------|-----------|---------------------------|\n");
            for (UseCaseInfo uc : securedUseCases) {
                String roles = String.join(", ", uc.getRolesAllowed());
                String spring = uc.getRolesAllowed().size() == 1
                        ? "@PreAuthorize(\"hasRole('" + uc.getRolesAllowed().get(0) + "')\")"
                        : "@PreAuthorize(\"hasAnyRole('" + String.join("', '", uc.getRolesAllowed()) + "')\")";
                sb.append("| ").append(uc.getClassName())
                  .append(" | ").append(roles)
                  .append(" | `").append(spring).append("`")
                  .append(" |\n");
            }
            sb.append("\n");

            // Roles uniques
            Set<String> allRoles = securedUseCases.stream()
                    .flatMap(uc -> uc.getRolesAllowed().stream())
                    .collect(Collectors.toSet());
            sb.append("### 4.2 Roles detectes\n\n");
            sb.append("Les roles suivants doivent etre configures dans le provider d'identite (Keycloak, AD, etc.) :\n\n");
            for (String role : allRoles) {
                sb.append("- `").append(role).append("`\n");
            }
            sb.append("\n");
        }
    }

    private void appendTransactionImpact(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 5. Impact sur les Transactions et la Concurrence\n\n");

        long stateful = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        long mdb = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();

        sb.append("### 5.1 Transactions\n\n");
        sb.append("| Aspect | EJB | Spring Boot | Action requise |\n");
        sb.append("|--------|-----|-------------|----------------|\n");
        sb.append("| CMT (Container-Managed) | @TransactionAttribute | @Transactional | Automatique |\n");
        sb.append("| BMT (Bean-Managed) | UserTransaction | @Transactional(propagation=...) | Verification manuelle |\n");
        sb.append("| XA (Distributed) | JTA | Spring JTA / Atomikos | Configuration requise |\n\n");

        if (stateful > 0) {
            sb.append("### 5.2 Etat conversationnel (@Stateful)\n\n");
            sb.append("**").append(stateful).append(" EJB @Stateful detecte(s)**. L'etat conversationnel n'est pas reproduit dans la facade REST.\n\n");
            sb.append("Options de migration :\n\n");
            sb.append("1. **Session HTTP** : stocker l'etat dans la session HTTP (simple mais non scalable)\n");
            sb.append("2. **Cache distribue** : Redis, Hazelcast (scalable, recommande)\n");
            sb.append("3. **Refactoring** : transformer en operations stateless (ideal mais couteux)\n\n");
        }

        if (mdb > 0) {
            sb.append("### 5.3 Messaging (@MessageDriven)\n\n");
            sb.append("**").append(mdb).append(" MDB detecte(s)**. Transformation en pattern Spring Event :\n\n");
            sb.append("- `@PostMapping` → `ApplicationEventPublisher.publishEvent()` → `@EventListener` + `@Async`\n");
            sb.append("- Le traitement asynchrone est preserve\n");
            sb.append("- La garantie de livraison JMS n'est pas reproduite (utiliser Spring JMS ou Kafka si necessaire)\n\n");
        }
    }

    private void appendComplexityMatrix(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 6. Matrice de Complexite\n\n");
        sb.append("Chaque UseCase est evalue selon 5 criteres de complexite (0-3 points chacun) :\n\n");

        sb.append("| UseCase | Type | Pattern | Securite | JAXB | BIAN | **Total** | **Niveau** |\n");
        sb.append("|---------|------|---------|----------|------|------|-----------|------------|\n");

        for (UseCaseInfo uc : analysis.getUseCases()) {
            int typeScore = scoreEjbType(uc);
            int patternScore = scorePattern(uc);
            int securityScore = (uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty()) ? 1 : 0;
            int jaxbScore = scoreJaxb(uc, analysis);
            int bianScore = (uc.getBianMapping() != null) ? 2 : 0;
            int total = typeScore + patternScore + securityScore + jaxbScore + bianScore;
            String level = total <= 3 ? "Simple" : total <= 7 ? "Moyen" : "Complexe";

            sb.append("| ").append(uc.getClassName())
              .append(" | ").append(typeScore)
              .append(" | ").append(patternScore)
              .append(" | ").append(securityScore)
              .append(" | ").append(jaxbScore)
              .append(" | ").append(bianScore)
              .append(" | **").append(total).append("**")
              .append(" | ").append(level)
              .append(" |\n");
        }
        sb.append("\n");
        sb.append("**Legende** : Type (0=Stateless, 2=Stateful, 1=MDB) | Pattern (0=BaseUseCase, 2=MultiMethod) | Securite (0=aucune, 1=@RolesAllowed) | JAXB (0-2) | BIAN (0=non, 2=oui)\n\n");
    }

    private void appendRisksAndRecommendations(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 7. Risques et Recommandations\n\n");

        List<String[]> risks = new ArrayList<>();

        long stateful = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count();
        if (stateful > 0) {
            risks.add(new String[]{"Eleve", "Perte d'etat conversationnel",
                    stateful + " EJB @Stateful detecte(s). L'etat conversationnel n'est pas reproduit.",
                    "Utiliser un cache distribue (Redis) ou refactorer en stateless"});
        }

        long mdb = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count();
        if (mdb > 0) {
            risks.add(new String[]{"Moyen", "Garantie de livraison JMS",
                    "Les MDB JMS sont transformes en Spring Events sans garantie de livraison.",
                    "Utiliser Spring JMS ou Apache Kafka pour les messages critiques"});
        }

        if (analysis.getUseCases().stream().anyMatch(uc -> uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty())) {
            risks.add(new String[]{"Moyen", "Configuration securite",
                    "Les roles @RolesAllowed sont migres vers @PreAuthorize mais le provider d'identite doit etre configure.",
                    "Configurer Spring Security avec OAuth2/JWT et verifier les roles dans le provider"});
        }

        risks.add(new String[]{"Faible", "Migration javax → jakarta",
                "Toutes les annotations javax.* sont migrees vers jakarta.*.",
                "Verifier la compatibilite des librairies tierces"});

        risks.add(new String[]{"Faible", "Serialisation JSON",
                "Le format de serialisation passe de Java Serialization a JSON/Jackson.",
                "Tester les DTOs complexes (heritage, generiques, collections imbriquees)"});

        if (!risks.isEmpty()) {
            sb.append("| Severite | Risque | Description | Mitigation |\n");
            sb.append("|----------|--------|-------------|------------|\n");
            for (String[] risk : risks) {
                sb.append("| ").append(risk[0])
                  .append(" | ").append(risk[1])
                  .append(" | ").append(risk[2])
                  .append(" | ").append(risk[3])
                  .append(" |\n");
            }
            sb.append("\n");
        }
    }

    private void appendMigrationPlan(StringBuilder sb, ProjectAnalysisResult analysis) {
        sb.append("## 8. Plan de Migration Recommande\n\n");

        sb.append("### Phase 1 : Validation (1-2 jours)\n\n");
        sb.append("1. Compiler le projet genere (`mvn clean compile`)\n");
        sb.append("2. Demarrer en mode mock (`spring.profiles.active=mock`)\n");
        sb.append("3. Tester chaque endpoint via Swagger UI\n");
        sb.append("4. Verifier les DTOs de requete et de reponse\n\n");

        sb.append("### Phase 2 : Integration EJB (2-3 jours)\n\n");
        sb.append("1. Configurer les proprietes JNDI (`ejb.jndi.provider-url`)\n");
        sb.append("2. Basculer sur le profil `jndi` (`spring.profiles.active=jndi`)\n");
        sb.append("3. Tester la connectivite avec le serveur d'applications\n");
        sb.append("4. Valider les appels EJB reels\n\n");

        sb.append("### Phase 3 : Securite (1-2 jours)\n\n");
        sb.append("1. Configurer Spring Security (OAuth2/JWT)\n");
        sb.append("2. Verifier les annotations @PreAuthorize\n");
        sb.append("3. Tester les acces par role\n\n");

        sb.append("### Phase 4 : Tests et deploiement (2-3 jours)\n\n");
        sb.append("1. Ecrire les tests d'integration\n");
        sb.append("2. Configurer le pipeline CI/CD\n");
        sb.append("3. Deployer en environnement de recette\n");
        sb.append("4. Valider avec les equipes metier\n\n");

        int totalDays = 6 + (analysis.getUseCases().size() > 10 ? 4 : 0);
        sb.append("**Effort estime** : ").append(totalDays).append("-").append(totalDays + 4).append(" jours/homme\n\n");

        sb.append("---\n\n");
        sb.append("*Rapport genere par EJB-to-REST Generator v3.0 — Compleo — ")
          .append(LocalDate.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))).append("*\n");
    }

    // --- Methodes utilitaires ---

    private int calculateGlobalImpactScore(ProjectAnalysisResult analysis) {
        int score = 10; // base
        score += analysis.getUseCases().size() * 2;
        score += analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL).count() * 15;
        score += analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN).count() * 8;
        score += analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbPattern() == UseCaseInfo.EjbPattern.REMOTE_INTERFACE).count() * 5;
        score += analysis.getDtos().stream()
                .filter(DtoInfo::isHasXmlRootElement).count() * 2;
        return Math.min(score, 100);
    }

    private String resolveHttpMethod(UseCaseInfo uc) {
        if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) return "POST (async)";
        String lower = uc.getClassName().toLowerCase();
        if (lower.contains("get") || lower.contains("find") || lower.contains("search") ||
            lower.contains("consult") || lower.contains("list") || lower.contains("retrieve")) return "GET";
        if (lower.contains("update") || lower.contains("modifier") || lower.contains("maj")) return "PUT";
        if (lower.contains("delete") || lower.contains("supprimer")) return "DELETE";
        return "POST";
    }

    private String buildObservations(UseCaseInfo uc) {
        List<String> obs = new ArrayList<>();
        if (uc.getEjbType() == UseCaseInfo.EjbType.STATEFUL) obs.add("Stateful (perte d'etat)");
        if (uc.getEjbType() == UseCaseInfo.EjbType.MESSAGE_DRIVEN) obs.add("MDB → async");
        if (uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty()) obs.add("Securise");
        if (uc.getBianMapping() != null) obs.add("BIAN");
        if (uc.getEjbPattern() == UseCaseInfo.EjbPattern.REMOTE_INTERFACE) obs.add("Multi-methodes");
        return obs.isEmpty() ? "-" : String.join(", ", obs);
    }

    private int scoreEjbType(UseCaseInfo uc) {
        if (uc.getEjbType() == null) return 0;
        return switch (uc.getEjbType()) {
            case STATELESS -> 0;
            case STATEFUL -> 2;
            case MESSAGE_DRIVEN -> 1;
            case SINGLETON -> 0;
            case USE_CASE_CUSTOM -> 0;
            case SPRING_LEGACY -> 0;
        };
    }

    private int scorePattern(UseCaseInfo uc) {
        if (uc.getEjbPattern() == null) return 0;
        return switch (uc.getEjbPattern()) {
            case BASE_USE_CASE -> 0;
            case REMOTE_INTERFACE -> 2;
            case GENERIC_SERVICE -> 1;
            case LOCAL_INTERFACE -> 1;
            case DAO_REPOSITORY -> 1;
            case MULTI_METHOD_SERVICE -> 2;
            case ACTION_HANDLER -> 3;
        };
    }

    private int scoreJaxb(UseCaseInfo uc, ProjectAnalysisResult analysis) {
        String inputDto = uc.getInputDtoClassName();
        if (inputDto == null) return 0;
        return analysis.getDtos().stream()
                .filter(dto -> dto.getClassName().equals(inputDto) && dto.isHasXmlRootElement())
                .findFirst()
                .map(dto -> dto.getFields().size() > 10 ? 2 : 1)
                .orElse(0);
    }
}
