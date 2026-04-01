package com.bank.tools.generator.annotation;

import com.bank.tools.generator.annotation.CustomAnnotationDefinition.Category;
import com.bank.tools.generator.annotation.CustomAnnotationDefinition.PropagationStrategy;
import com.bank.tools.generator.annotation.DetectedAnnotation.RecognitionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Moteur de propagation des annotations custom bancaires.
 * Responsabilites :
 * 1. Detecter les annotations non-standard dans le code source EJB
 * 2. Les classifier via le CustomAnnotationRegistry
 * 3. Generer le code de propagation pour les wrappers REST
 * 4. Produire un rapport d'alertes pour les annotations inconnues
 */
@Component
public class AnnotationPropagator {

    private static final Logger log = LoggerFactory.getLogger(AnnotationPropagator.class);

    private final CustomAnnotationRegistry registry;

    public AnnotationPropagator(CustomAnnotationRegistry registry) {
        this.registry = registry;
    }

    // ==================== DETECTION ====================

    /**
     * Analyse une liste d'annotations brutes (noms simples) detectees sur un EJB
     * et les classifie via le registre.
     *
     * @param annotationNames  Noms simples des annotations (ex: "BmceSecured", "AuditLog")
     * @param annotationExprs  Expressions completes (ex: "@BmceSecured(\"AGENT\")")
     * @param sourceClassName  Nom de la classe source
     * @param classLevel       true si annotations de classe, false si annotations de methode
     * @param packageHint      Package de la classe source (pour classifier les inconnues)
     * @return Liste des annotations detectees et classifiees
     */
    public List<DetectedAnnotation> detectAndClassify(
            List<String> annotationNames,
            List<String> annotationExprs,
            String sourceClassName,
            boolean classLevel,
            String packageHint) {

        List<DetectedAnnotation> detected = new ArrayList<>();

        for (int i = 0; i < annotationNames.size(); i++) {
            String name = annotationNames.get(i);
            String expr = i < annotationExprs.size() ? annotationExprs.get(i) : "@" + name;

            // Ignorer les annotations standard
            if (registry.isStandardAnnotation(name)) {
                continue;
            }

            RecognitionStatus status = registry.classify(name, packageHint);
            if (status == null) {
                continue; // Annotation standard, on passe
            }

            DetectedAnnotation da = new DetectedAnnotation(name, expr, sourceClassName, classLevel, status);

            // Si connue, attacher la definition et resoudre les attributs
            if (status == RecognitionStatus.KNOWN) {
                CustomAnnotationDefinition def = registry.lookup(name).orElse(null);
                da.setDefinition(def);
                da.setResolvedAttributes(extractAttributes(expr, def));
                log.info("Annotation custom CONNUE detectee : {} sur {} [{}]",
                        expr, sourceClassName, def != null ? def.getCategory() : "?");
            } else {
                log.warn("Annotation custom INCONNUE detectee : {} sur {} [status={}]",
                        expr, sourceClassName, status);
            }

            detected.add(da);
        }

        return detected;
    }

    // ==================== PROPAGATION ====================

    /**
     * Genere les annotations a propager sur la CLASSE du controller/service genere.
     */
    public List<String> getClassLevelAnnotations(List<DetectedAnnotation> detected) {
        return detected.stream()
                .filter(da -> da.isKnown() && da.getDefinition() != null)
                .filter(da -> {
                    PropagationStrategy ps = da.getDefinition().getPropagation();
                    return ps == PropagationStrategy.PROPAGATE_CLASS ||
                           ps == PropagationStrategy.PROPAGATE_BOTH ||
                           (ps == PropagationStrategy.TRANSFORM && da.isClassLevel());
                })
                .map(DetectedAnnotation::toGeneratedCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    /**
     * Genere les annotations a propager sur chaque METHODE du controller genere.
     */
    public List<String> getMethodLevelAnnotations(List<DetectedAnnotation> detected) {
        return detected.stream()
                .filter(da -> da.isKnown() && da.getDefinition() != null)
                .filter(da -> {
                    PropagationStrategy ps = da.getDefinition().getPropagation();
                    return ps == PropagationStrategy.PROPAGATE_METHOD ||
                           ps == PropagationStrategy.PROPAGATE_BOTH ||
                           (ps == PropagationStrategy.TRANSFORM && !da.isClassLevel());
                })
                .map(DetectedAnnotation::toGeneratedCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    /**
     * Genere les commentaires pour les annotations de type COMMENT.
     */
    public List<String> getCommentAnnotations(List<DetectedAnnotation> detected) {
        return detected.stream()
                .filter(da -> da.isKnown() && da.getDefinition() != null)
                .filter(da -> da.getDefinition().getPropagation() == PropagationStrategy.COMMENT)
                .map(DetectedAnnotation::toGeneratedCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    /**
     * Genere les TODO pour les annotations inconnues.
     */
    public List<String> getUnknownAnnotationTodos(List<DetectedAnnotation> detected) {
        return detected.stream()
                .filter(DetectedAnnotation::isUnknown)
                .map(da -> "// TODO [ANNOTATION INCONNUE - " + da.getStatus() + "] " +
                           da.getFullExpression() + " detectee sur " + da.getSourceClassName() +
                           " - A declarer dans custom-annotations.yml ou propager manuellement")
                .collect(Collectors.toList());
    }

    /**
     * Genere les imports supplementaires necessaires pour les annotations transformees.
     */
    public Set<String> getRequiredImports(List<DetectedAnnotation> detected) {
        Set<String> imports = new LinkedHashSet<>();

        for (DetectedAnnotation da : detected) {
            if (!da.isKnown() || da.getDefinition() == null) continue;

            Category cat = da.getDefinition().getCategory();
            PropagationStrategy ps = da.getDefinition().getPropagation();

            if (ps == PropagationStrategy.TRANSFORM) {
                String springEq = da.getDefinition().getSpringEquivalent();
                if (springEq != null) {
                    if (springEq.contains("@PreAuthorize")) {
                        imports.add("org.springframework.security.access.prepost.PreAuthorize");
                    }
                    if (springEq.contains("@Transactional")) {
                        imports.add("org.springframework.transaction.annotation.Transactional");
                        imports.add("org.springframework.transaction.annotation.Propagation");
                    }
                    if (springEq.contains("@Cacheable")) {
                        imports.add("org.springframework.cache.annotation.Cacheable");
                    }
                    if (springEq.contains("@Timed")) {
                        imports.add("io.micrometer.core.annotation.Timed");
                    }
                    if (springEq.contains("@Audited")) {
                        imports.add("org.springframework.data.envers.repository.support.Audited");
                    }
                }
            }
        }

        return imports;
    }

    // ==================== REPORT ====================

    /**
     * Genere un rapport de synthese des annotations detectees.
     */
    public AnnotationReport generateReport(List<DetectedAnnotation> allDetected) {
        AnnotationReport report = new AnnotationReport();

        for (DetectedAnnotation da : allDetected) {
            report.totalDetected++;

            if (da.isKnown()) {
                report.totalKnown++;
                report.knownByCategory
                        .computeIfAbsent(da.getDefinition().getCategory(), k -> new ArrayList<>())
                        .add(da);
            } else if (da.getStatus() == RecognitionStatus.UNKNOWN_INTERNAL) {
                report.totalUnknownInternal++;
                report.unknownInternal.add(da);
            } else {
                report.totalUnknownExternal++;
                report.unknownExternal.add(da);
            }

            // Compter les propagations
            if (da.isKnown() && da.getDefinition() != null) {
                PropagationStrategy ps = da.getDefinition().getPropagation();
                report.propagationCounts.merge(ps, 1, Integer::sum);
            }
        }

        return report;
    }

    // ==================== INNER CLASS: REPORT ====================

    /**
     * Rapport de synthese des annotations custom detectees.
     */
    public static class AnnotationReport {
        public int totalDetected = 0;
        public int totalKnown = 0;
        public int totalUnknownInternal = 0;
        public int totalUnknownExternal = 0;

        public Map<Category, List<DetectedAnnotation>> knownByCategory = new LinkedHashMap<>();
        public List<DetectedAnnotation> unknownInternal = new ArrayList<>();
        public List<DetectedAnnotation> unknownExternal = new ArrayList<>();
        public Map<PropagationStrategy, Integer> propagationCounts = new LinkedHashMap<>();

        public boolean hasUnknownAnnotations() {
            return totalUnknownInternal > 0 || totalUnknownExternal > 0;
        }

        public int getAlertLevel() {
            if (totalUnknownInternal > 0) return 2; // ATTENTION : annotations internes non declarees
            if (totalUnknownExternal > 0) return 1; // INFO : annotations externes non reconnues
            return 0; // OK : tout est connu
        }

        /**
         * Genere le rapport au format Markdown.
         */
        public String toMarkdown() {
            StringBuilder sb = new StringBuilder();
            sb.append("# Rapport Annotations Custom Bancaires\n\n");

            // Synthese
            sb.append("## Synthese\n\n");
            sb.append("| Metrique | Valeur |\n");
            sb.append("|----------|--------|\n");
            sb.append("| Total detectees | ").append(totalDetected).append(" |\n");
            sb.append("| Connues (registre) | ").append(totalKnown).append(" |\n");
            sb.append("| Inconnues internes | ").append(totalUnknownInternal).append(" |\n");
            sb.append("| Inconnues externes | ").append(totalUnknownExternal).append(" |\n");
            sb.append("| Niveau d'alerte | ").append(getAlertLevel() == 0 ? "OK" :
                    getAlertLevel() == 1 ? "INFO" : "ATTENTION").append(" |\n\n");

            // Annotations connues par categorie
            if (!knownByCategory.isEmpty()) {
                sb.append("## Annotations Connues par Categorie\n\n");
                for (Map.Entry<Category, List<DetectedAnnotation>> entry : knownByCategory.entrySet()) {
                    sb.append("### ").append(entry.getKey()).append("\n\n");
                    sb.append("| Annotation | Classe Source | Propagation |\n");
                    sb.append("|------------|--------------|-------------|\n");
                    for (DetectedAnnotation da : entry.getValue()) {
                        sb.append("| `").append(da.getFullExpression()).append("` | ")
                          .append(da.getSourceClassName()).append(" | ")
                          .append(da.getDefinition().getPropagation()).append(" |\n");
                    }
                    sb.append("\n");
                }
            }

            // Strategie de propagation
            if (!propagationCounts.isEmpty()) {
                sb.append("## Strategies de Propagation\n\n");
                sb.append("| Strategie | Nombre |\n");
                sb.append("|-----------|--------|\n");
                for (Map.Entry<PropagationStrategy, Integer> entry : propagationCounts.entrySet()) {
                    sb.append("| ").append(entry.getKey()).append(" | ")
                      .append(entry.getValue()).append(" |\n");
                }
                sb.append("\n");
            }

            // Alertes : annotations inconnues internes
            if (!unknownInternal.isEmpty()) {
                sb.append("## ALERTE : Annotations Internes Non Declarees\n\n");
                sb.append("> Ces annotations proviennent de packages internes de la banque mais ne sont pas\n");
                sb.append("> declarees dans `custom-annotations.yml`. Elles doivent etre ajoutees au registre.\n\n");
                sb.append("| Annotation | Classe Source | Action Requise |\n");
                sb.append("|------------|--------------|----------------|\n");
                for (DetectedAnnotation da : unknownInternal) {
                    sb.append("| `").append(da.getFullExpression()).append("` | ")
                      .append(da.getSourceClassName())
                      .append(" | Ajouter dans custom-annotations.yml |\n");
                }
                sb.append("\n");
            }

            // Info : annotations externes non reconnues
            if (!unknownExternal.isEmpty()) {
                sb.append("## INFO : Annotations Externes Non Reconnues\n\n");
                sb.append("| Annotation | Classe Source |\n");
                sb.append("|------------|-------------|\n");
                for (DetectedAnnotation da : unknownExternal) {
                    sb.append("| `").append(da.getFullExpression()).append("` | ")
                      .append(da.getSourceClassName()).append(" |\n");
                }
                sb.append("\n");
            }

            return sb.toString();
        }
    }

    // ==================== PRIVATE HELPERS ====================

    /**
     * Extrait les attributs d'une expression d'annotation.
     * Ex: "@BmceSecured(\"AGENT\")" → {value: "AGENT"}
     * Ex: "@AuditLog(action=\"MODIFICATION\", entity=\"COMPTE\")" → {action: "MODIFICATION", entity: "COMPTE"}
     */
    private Map<String, String> extractAttributes(String expr, CustomAnnotationDefinition def) {
        Map<String, String> attrs = new LinkedHashMap<>();
        if (expr == null || !expr.contains("(")) return attrs;

        String content = expr.substring(expr.indexOf('(') + 1, expr.lastIndexOf(')'));
        if (content.isBlank()) return attrs;

        // Cas simple : valeur unique sans nom → attribut "value"
        if (!content.contains("=")) {
            String value = content.trim().replace("\"", "");
            attrs.put("value", value);
            return attrs;
        }

        // Cas complexe : attributs nommes
        // Split par virgule en respectant les guillemets et accolades
        List<String> parts = splitAttributes(content);
        for (String part : parts) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) {
                String key = kv[0].trim();
                String val = kv[1].trim().replace("\"", "").replace("{", "").replace("}", "");
                attrs.put(key, val);
            }
        }

        return attrs;
    }

    /**
     * Split les attributs d'annotation en respectant les guillemets et accolades.
     */
    private List<String> splitAttributes(String content) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        boolean inQuotes = false;
        StringBuilder current = new StringBuilder();

        for (char c : content.toCharArray()) {
            if (c == '"') inQuotes = !inQuotes;
            if (!inQuotes) {
                if (c == '{') depth++;
                if (c == '}') depth--;
                if (c == ',' && depth == 0) {
                    parts.add(current.toString());
                    current = new StringBuilder();
                    continue;
                }
            }
            current.append(c);
        }
        if (current.length() > 0) {
            parts.add(current.toString());
        }

        return parts;
    }
}
