package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Detecte automatiquement si un projet EJB est candidat au mode BIAN.
 *
 * L'analyse se base sur 5 criteres ponderes :
 * 1. Noms des classes (mots-cles bancaires)
 * 2. Structure des packages (usecase, service, domain)
 * 3. Annotations detectees (UseCase, RolesAllowed, custom bancaires)
 * 4. DTOs avec termes bancaires
 * 5. Nombre de UseCases mappables vers des Service Domains
 *
 * Si le score depasse le seuil (70%), le mode BIAN est recommande.
 */
@Component
public class BianAutoDetector {

    private static final Logger log = LoggerFactory.getLogger(BianAutoDetector.class);

    private static final int BIAN_THRESHOLD = 70;

    private static final List<String> BANKING_KEYWORDS = List.of(
            "compte", "account", "credit", "loan", "pret",
            "carte", "card", "paiement", "payment", "virement", "transfer",
            "client", "customer", "tiers", "party",
            "epargne", "savings", "depot", "deposit",
            "solde", "balance", "releve", "statement",
            "cheque", "chequier", "encaissement",
            "fraude", "fraud", "kyc", "aml", "conformite", "compliance",
            "risque", "risk", "scoring", "notation",
            "document", "contrat", "contract",
            "assurance", "insurance", "garantie", "guarantee",
            "operation", "transaction", "mouvement",
            "agence", "agency", "guichet", "atm",
            "devise", "currency", "change", "forex",
            "placement", "investissement", "investment",
            "beneficiaire", "beneficiary", "mandataire",
            "rib", "iban", "bic", "swift"
    );

    private static final List<String> BANKING_PACKAGE_PATTERNS = List.of(
            "usecase", "usecases", "service", "services",
            "domain", "domains", "banking", "bank", "banque",
            "finance", "financial", "core", "metier", "business"
    );

    private static final List<String> BANKING_ANNOTATIONS = List.of(
            "UseCase", "RolesAllowed", "TransactionAttribute",
            "AuditLog", "Audited", "ChannelRestricted",
            "CacheResult", "Cacheable",
            "ValidRIB", "ValidIBAN", "ValidBIC"
    );

    /**
     * Resultat de l'auto-detection BIAN.
     */
    public static class DetectionResult {
        private final int score;
        private final boolean recommended;
        private final Map<String, Integer> criteriaScores;
        private final List<String> matchedKeywords;
        private final List<String> matchedServiceDomains;
        private final String summary;

        public DetectionResult(int score, boolean recommended,
                               Map<String, Integer> criteriaScores,
                               List<String> matchedKeywords,
                               List<String> matchedServiceDomains,
                               String summary) {
            this.score = score;
            this.recommended = recommended;
            this.criteriaScores = criteriaScores;
            this.matchedKeywords = matchedKeywords;
            this.matchedServiceDomains = matchedServiceDomains;
            this.summary = summary;
        }

        public int getScore() { return score; }
        public boolean isRecommended() { return recommended; }
        public Map<String, Integer> getCriteriaScores() { return criteriaScores; }
        public List<String> getMatchedKeywords() { return matchedKeywords; }
        public List<String> getMatchedServiceDomains() { return matchedServiceDomains; }
        public String getSummary() { return summary; }
    }

    /**
     * Analyse un projet EJB et determine s'il est candidat au mode BIAN.
     */
    public DetectionResult detect(ProjectAnalysisResult analysis) {
        Map<String, Integer> criteriaScores = new LinkedHashMap<>();
        List<String> matchedKeywords = new ArrayList<>();
        List<String> matchedServiceDomains = new ArrayList<>();

        int classNameScore = analyzeClassNames(analysis, matchedKeywords);
        criteriaScores.put("Noms des classes (mots-cles bancaires)", classNameScore);

        int packageScore = analyzePackageStructure(analysis);
        criteriaScores.put("Structure des packages", packageScore);

        int annotationScore = analyzeAnnotations(analysis);
        criteriaScores.put("Annotations bancaires", annotationScore);

        int dtoScore = analyzeDtos(analysis, matchedKeywords);
        criteriaScores.put("DTOs bancaires", dtoScore);

        int mappingScore = analyzeBianMappability(analysis, matchedServiceDomains);
        criteriaScores.put("Mappabilite vers Service Domains BIAN", mappingScore);

        int weightedScore = (int) (
                classNameScore * 0.30 +
                packageScore * 0.15 +
                annotationScore * 0.20 +
                dtoScore * 0.15 +
                mappingScore * 0.20
        );

        boolean recommended = weightedScore >= BIAN_THRESHOLD;
        String summary = buildSummary(weightedScore, recommended, analysis, matchedKeywords, matchedServiceDomains);

        DetectionResult result = new DetectionResult(
                weightedScore, recommended, criteriaScores,
                matchedKeywords, matchedServiceDomains, summary);

        log.info("[BIAN-DETECT] Score : {}/100 - Recommandation BIAN : {}",
                weightedScore, recommended ? "OUI" : "NON");

        return result;
    }

    private int analyzeClassNames(ProjectAnalysisResult analysis, List<String> matchedKeywords) {
        if (analysis.getUseCases().isEmpty()) return 0;

        int matches = 0;
        for (UseCaseInfo uc : analysis.getUseCases()) {
            String lower = uc.getClassName().toLowerCase();
            for (String keyword : BANKING_KEYWORDS) {
                if (lower.contains(keyword)) {
                    matches++;
                    if (!matchedKeywords.contains(keyword)) {
                        matchedKeywords.add(keyword);
                    }
                    break;
                }
            }
        }

        double ratio = (double) matches / analysis.getUseCases().size();
        return Math.min((int) (ratio * 100), 100);
    }

    private int analyzePackageStructure(ProjectAnalysisResult analysis) {
        Set<String> allPackages = new HashSet<>();
        for (UseCaseInfo uc : analysis.getUseCases()) {
            if (uc.getPackageName() != null) allPackages.add(uc.getPackageName().toLowerCase());
        }
        for (DtoInfo dto : analysis.getDtos()) {
            if (dto.getPackageName() != null) allPackages.add(dto.getPackageName().toLowerCase());
        }

        if (allPackages.isEmpty()) return 0;

        int matches = 0;
        for (String pkg : allPackages) {
            for (String pattern : BANKING_PACKAGE_PATTERNS) {
                if (pkg.contains(pattern)) {
                    matches++;
                    break;
                }
            }
        }

        double ratio = (double) matches / allPackages.size();
        return Math.min((int) (ratio * 100), 100);
    }

    private int analyzeAnnotations(ProjectAnalysisResult analysis) {
        int score = 0;

        // Check @RolesAllowed
        long withRoles = analysis.getUseCases().stream()
                .filter(uc -> uc.getRolesAllowed() != null && !uc.getRolesAllowed().isEmpty()).count();
        if (withRoles > 0) score += 30;

        // Check custom annotations
        if (!analysis.getDetectedValidators().isEmpty()) score += 20;

        // Check UseCase pattern (BaseUseCase)
        long baseUseCases = analysis.getUseCases().stream()
                .filter(uc -> uc.getEjbPattern() == UseCaseInfo.EjbPattern.BASE_USE_CASE).count();
        if (baseUseCases > 0) score += 30;

        // Bonus si des annotations custom bancaires sont detectees
        if (analysis.getDetectedValidators().stream()
                .anyMatch(v -> BANKING_ANNOTATIONS.stream()
                        .anyMatch(a -> v.getAnnotationName() != null && v.getAnnotationName().contains(a)))) {
            score += 20;
        }

        return Math.min(score, 100);
    }

    private int analyzeDtos(ProjectAnalysisResult analysis, List<String> matchedKeywords) {
        if (analysis.getDtos().isEmpty()) return 0;

        int matches = 0;
        for (DtoInfo dto : analysis.getDtos()) {
            String lower = dto.getClassName().toLowerCase();
            for (String keyword : BANKING_KEYWORDS) {
                if (lower.contains(keyword)) {
                    matches++;
                    if (!matchedKeywords.contains(keyword)) {
                        matchedKeywords.add(keyword);
                    }
                    break;
                }
            }
        }

        double ratio = (double) matches / analysis.getDtos().size();
        return Math.min((int) (ratio * 100), 100);
    }

    private int analyzeBianMappability(ProjectAnalysisResult analysis, List<String> matchedServiceDomains) {
        if (analysis.getUseCases().isEmpty()) return 0;

        Map<String, List<String>> domainKeywords = Map.ofEntries(
                Map.entry("current-account", List.of("compte", "account", "courant")),
                Map.entry("savings-account", List.of("epargne", "savings")),
                Map.entry("consumer-loan", List.of("credit", "loan", "pret", "simuler")),
                Map.entry("card-management", List.of("carte", "card")),
                Map.entry("payment-execution", List.of("paiement", "payment", "virement", "transfer")),
                Map.entry("customer-management", List.of("client", "customer", "tiers", "party")),
                Map.entry("document-management", List.of("document", "fichier", "file")),
                Map.entry("fraud-detection", List.of("fraude", "fraud", "suspicious")),
                Map.entry("regulatory-compliance", List.of("conformite", "compliance", "kyc", "aml")),
                Map.entry("risk-management", List.of("risque", "risk", "scoring"))
        );

        int mappedCount = 0;
        for (UseCaseInfo uc : analysis.getUseCases()) {
            String lower = uc.getClassName().toLowerCase();
            for (Map.Entry<String, List<String>> entry : domainKeywords.entrySet()) {
                boolean matched = entry.getValue().stream().anyMatch(lower::contains);
                if (matched) {
                    mappedCount++;
                    if (!matchedServiceDomains.contains(entry.getKey())) {
                        matchedServiceDomains.add(entry.getKey());
                    }
                    break;
                }
            }
        }

        double ratio = (double) mappedCount / analysis.getUseCases().size();
        return Math.min((int) (ratio * 100), 100);
    }

    private String buildSummary(int score, boolean recommended,
                                 ProjectAnalysisResult analysis,
                                 List<String> matchedKeywords,
                                 List<String> matchedServiceDomains) {
        StringBuilder sb = new StringBuilder();
        sb.append("Score BIAN : ").append(score).append("/100\n");
        sb.append("Recommandation : ").append(recommended ? "ACTIVER le mode BIAN" : "Mode standard recommande").append("\n");
        sb.append("UseCases analyses : ").append(analysis.getUseCases().size()).append("\n");
        sb.append("Mots-cles bancaires detectes : ").append(String.join(", ", matchedKeywords)).append("\n");
        sb.append("Service Domains BIAN identifies : ").append(String.join(", ", matchedServiceDomains)).append("\n");
        return sb.toString();
    }
}
