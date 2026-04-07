package com.bank.tools.generator.cartography;

import com.bank.tools.generator.config.CompleoConfig;
import com.bank.tools.generator.cartography.CartographyReport.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Cartographe du patrimoine applicatif legacy.
 * Analyse un projet source et produit un CartographyReport complet
 * avec statistiques, dependances, complexite et recommandations.
 */
@Component
public class LegacyCartographer {

    private static final Logger log = LoggerFactory.getLogger(LegacyCartographer.class);

    private static final int GOD_CLASS_THRESHOLD = 500;
    private static final Pattern IMPORT_PATTERN = Pattern.compile("^import\\s+(static\\s+)?([\\w.]+);", Pattern.MULTILINE);
    private static final Pattern CLASS_PATTERN = Pattern.compile("(?:public|protected|private)?\\s*(?:abstract\\s+)?(?:class|interface|enum)\\s+(\\w+)");
    private static final Pattern ANNOTATION_PATTERN = Pattern.compile("@(\\w+)");
    private static final Pattern FIELD_INJECTION_PATTERN = Pattern.compile("(?:@Inject|@Autowired|@EJB|@Resource)\\s+.*?\\s+(\\w+)\\s+(\\w+)");

    private CompleoConfig compleoConfig;

    @Autowired(required = false)
    public void setCompleoConfig(CompleoConfig compleoConfig) {
        this.compleoConfig = compleoConfig;
    }

    /**
     * Analyse un projet et produit un rapport de cartographie complet.
     */
    public CartographyReport analyze(Path projectRoot) {
        log.info("[Cartographer] Demarrage de la cartographie : {}", projectRoot);
        CartographyReport report = new CartographyReport();

        try {
            List<Path> javaFiles = findJavaFiles(projectRoot);
            Map<String, String> classContents = new LinkedHashMap<>();
            Map<String, List<String>> classImports = new LinkedHashMap<>();

            // Phase 1 : Lire tous les fichiers et extraire les metadonnees
            for (Path file : javaFiles) {
                String content = Files.readString(file);
                String className = extractClassName(content);
                if (className != null) {
                    classContents.put(className, content);
                    classImports.put(className, extractImports(content));
                }
            }

            // Phase 2 : Statistiques globales
            computeStats(report, javaFiles, classContents);

            // Phase 3 : Framework usage
            computeFrameworkUsage(report, classContents);

            // Phase 4 : Dependances inter-services
            computeDependencies(report, classContents, classImports);

            // Phase 5 : Detection de dependances circulaires
            detectCircularDependencies(report);

            // Phase 6 : Complexite par service
            computeComplexity(report, classContents);

            // Phase 7 : God classes
            detectGodClasses(report, classContents, javaFiles);

            // Phase 8 : APIs deprecees
            detectDeprecatedApis(report, classContents);

            // Phase 9 : Recommandations et strategie
            generateRecommendations(report);

            log.info("[Cartographer] Cartographie terminee : {} classes, {} services, {} LOC",
                    report.getTotalClasses(), report.getTotalServices(), report.getTotalLinesOfCode());

        } catch (IOException e) {
            log.error("[Cartographer] Erreur lors de la cartographie : {}", e.getMessage());
        }

        return report;
    }

    /**
     * Genere un rapport Markdown de la cartographie.
     */
    public String generateMarkdownReport(CartographyReport report) {
        StringBuilder md = new StringBuilder();
        md.append("# Rapport de Cartographie du Patrimoine Applicatif\n\n");

        // Stats
        md.append("## Statistiques Globales\n\n");
        md.append("| Metrique | Valeur |\n|---|---|\n");
        md.append("| Classes | ").append(report.getTotalClasses()).append(" |\n");
        md.append("| Lignes de code | ").append(report.getTotalLinesOfCode()).append(" |\n");
        md.append("| Services/EJBs | ").append(report.getTotalServices()).append(" |\n");
        md.append("| DTOs | ").append(report.getTotalDtos()).append(" |\n");
        md.append("| Entites JPA | ").append(report.getTotalEntities()).append(" |\n");
        md.append("| MDBs | ").append(report.getTotalMdbs()).append(" |\n");
        md.append("| Interfaces | ").append(report.getTotalInterfaces()).append(" |\n");
        md.append("| Enums | ").append(report.getTotalEnums()).append(" |\n\n");

        // Framework usage
        md.append("## Utilisation des Frameworks\n\n");
        md.append("| Framework/API | Occurrences |\n|---|---|\n");
        report.getFrameworkUsage().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .forEach(e -> md.append("| ").append(e.getKey()).append(" | ").append(e.getValue()).append(" |\n"));
        md.append("\n");

        // Complexite
        md.append("## Complexite par Service\n\n");
        md.append("| Service | Methodes | Deps | Score | Complexite |\n|---|---|---|---|---|\n");
        report.getServiceComplexities().values().stream()
                .sorted(Comparator.comparingInt(ServiceComplexity::getScore).reversed())
                .forEach(sc -> md.append("| ").append(sc.getServiceName())
                        .append(" | ").append(sc.getMethodCount())
                        .append(" | ").append(sc.getDependencyCount())
                        .append(" | ").append(sc.getScore())
                        .append(" | **").append(sc.getComplexity()).append("** |\n"));
        md.append("\n");

        // Dependances circulaires
        if (!report.getCircularDependencies().isEmpty()) {
            md.append("## Dependances Circulaires Detectees\n\n");
            for (List<String> cycle : report.getCircularDependencies()) {
                md.append("- ").append(String.join(" -> ", cycle)).append("\n");
            }
            md.append("\n");
        }

        // God classes
        if (!report.getGodClasses().isEmpty()) {
            md.append("## God Classes (>").append(GOD_CLASS_THRESHOLD).append(" lignes)\n\n");
            md.append("| Classe | Lignes | Methodes |\n|---|---|---|\n");
            report.getGodClasses().forEach(gc -> md.append("| ").append(gc.getClassName())
                    .append(" | ").append(gc.getLineCount())
                    .append(" | ").append(gc.getMethodCount()).append(" |\n"));
            md.append("\n");
        }

        // APIs deprecees
        if (!report.getDeprecatedApis().isEmpty()) {
            md.append("## APIs Deprecees\n\n");
            report.getDeprecatedApis().forEach(api -> md.append("- ").append(api).append("\n"));
            md.append("\n");
        }

        // Strategie
        md.append("## Strategie de Migration Recommandee\n\n");
        md.append("> **").append(report.getSuggestedStrategy().name()).append("** : ")
                .append(report.getSuggestedStrategy().getDescription()).append("\n\n");

        // Recommandations
        md.append("## Recommandations\n\n");
        report.getRecommendations().forEach(r -> md.append("- ").append(r).append("\n"));

        return md.toString();
    }

    /**
     * Genere un graphe de dependances au format Mermaid.
     */
    public String generateMermaidGraph(CartographyReport report) {
        StringBuilder mmd = new StringBuilder();
        mmd.append("graph TD\n");

        for (Map.Entry<String, Set<String>> entry : report.getDependencies().entrySet()) {
            String from = sanitizeMermaidId(entry.getKey());
            for (String to : entry.getValue()) {
                String toId = sanitizeMermaidId(to);
                mmd.append("    ").append(from).append("[").append(entry.getKey()).append("]")
                        .append(" --> ").append(toId).append("[").append(to).append("]\n");
            }
        }

        // Colorer les services par complexite
        for (ServiceComplexity sc : report.getServiceComplexities().values()) {
            String id = sanitizeMermaidId(sc.getServiceName());
            String color = switch (sc.getComplexity()) {
                case LOW -> "#4caf50";
                case MEDIUM -> "#ff9800";
                case HIGH -> "#f44336";
                case CRITICAL -> "#9c27b0";
            };
            mmd.append("    style ").append(id).append(" fill:").append(color).append(",color:#fff\n");
        }

        return mmd.toString();
    }

    /**
     * Genere un graphe de dependances interactif en HTML (vis.js).
     */
    public String generateVisJsGraph(CartographyReport report) {
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n<html><head><title>Cartographie des Dependances</title>\n");
        html.append("<script src=\"https://unpkg.com/vis-network/standalone/umd/vis-network.min.js\"></script>\n");
        html.append("<style>body{margin:0;font-family:Arial}#graph{width:100%;height:100vh}</style>\n");
        html.append("</head><body>\n<div id=\"graph\"></div>\n<script>\n");

        // Nodes
        html.append("var nodes = new vis.DataSet([\n");
        Set<String> allNodes = new LinkedHashSet<>();
        report.getDependencies().forEach((k, v) -> { allNodes.add(k); allNodes.addAll(v); });
        int nodeId = 1;
        Map<String, Integer> nodeIds = new LinkedHashMap<>();
        for (String node : allNodes) {
            nodeIds.put(node, nodeId);
            String color = "#97c2fc";
            ServiceComplexity sc = report.getServiceComplexities().get(node);
            if (sc != null) {
                color = switch (sc.getComplexity()) {
                    case LOW -> "#4caf50";
                    case MEDIUM -> "#ff9800";
                    case HIGH -> "#f44336";
                    case CRITICAL -> "#9c27b0";
                };
            }
            html.append("  {id:").append(nodeId).append(",label:'").append(node)
                    .append("',color:'").append(color).append("'},\n");
            nodeId++;
        }
        html.append("]);\n");

        // Edges
        html.append("var edges = new vis.DataSet([\n");
        for (Map.Entry<String, Set<String>> entry : report.getDependencies().entrySet()) {
            Integer fromId = nodeIds.get(entry.getKey());
            if (fromId == null) continue;
            for (String to : entry.getValue()) {
                Integer toId = nodeIds.get(to);
                if (toId != null) {
                    html.append("  {from:").append(fromId).append(",to:").append(toId).append(",arrows:'to'},\n");
                }
            }
        }
        html.append("]);\n");

        html.append("var container = document.getElementById('graph');\n");
        html.append("var data = {nodes:nodes,edges:edges};\n");
        html.append("var options = {physics:{barnesHut:{gravitationalConstant:-3000}},nodes:{shape:'box',font:{size:14}}};\n");
        html.append("new vis.Network(container,data,options);\n");
        html.append("</script></body></html>");

        return html.toString();
    }

    // ==================== PRIVATE METHODS ====================

    private void computeStats(CartographyReport report, List<Path> javaFiles, Map<String, String> classContents) throws IOException {
        report.setTotalClasses(classContents.size());
        int totalLoc = 0;
        int services = 0, dtos = 0, entities = 0, mdbs = 0, interfaces = 0, enums = 0;

        for (Map.Entry<String, String> entry : classContents.entrySet()) {
            String content = entry.getValue();
            totalLoc += content.lines().count();

            if (content.contains("@Stateless") || content.contains("@Service") || content.contains("@UseCase")) services++;
            if (content.contains("@Entity")) entities++;
            if (content.contains("@MessageDriven")) mdbs++;
            if (content.contains("interface " + entry.getKey())) interfaces++;
            if (content.contains("enum " + entry.getKey())) enums++;
            if (content.contains("implements Serializable") && !content.contains("@Entity")
                    && !content.contains("@Stateless") && !content.contains("@Service")) dtos++;
        }

        report.setTotalLinesOfCode(totalLoc);
        report.setTotalServices(services);
        report.setTotalDtos(dtos);
        report.setTotalEntities(entities);
        report.setTotalMdbs(mdbs);
        report.setTotalInterfaces(interfaces);
        report.setTotalEnums(enums);
    }

    private void computeFrameworkUsage(CartographyReport report, Map<String, String> classContents) {
        Map<String, Integer> usage = new LinkedHashMap<>();
        String[] frameworkPatterns = {
                "javax.ejb", "javax.jms", "javax.persistence", "javax.xml",
                "javax.ws.rs", "javax.inject", "javax.annotation",
                "jakarta.ejb", "jakarta.jms", "jakarta.persistence",
                "org.springframework", "org.hibernate",
                "ma.eai", "com.framework"
        };

        for (String content : classContents.values()) {
            for (String pattern : frameworkPatterns) {
                long count = content.lines()
                        .filter(line -> line.contains("import " + pattern))
                        .count();
                if (count > 0) {
                    usage.merge(pattern, (int) count, Integer::sum);
                }
            }
        }
        report.setFrameworkUsage(usage);
    }

    private void computeDependencies(CartographyReport report, Map<String, String> classContents,
                                      Map<String, List<String>> classImports) {
        Set<String> serviceClasses = new HashSet<>();
        for (Map.Entry<String, String> entry : classContents.entrySet()) {
            String content = entry.getValue();
            if (content.contains("@Stateless") || content.contains("@Service") ||
                    content.contains("@UseCase") || content.contains("@Component")) {
                serviceClasses.add(entry.getKey());
            }
        }

        Map<String, Set<String>> deps = new LinkedHashMap<>();
        for (String service : serviceClasses) {
            Set<String> serviceDeps = new LinkedHashSet<>();
            String content = classContents.get(service);
            if (content != null) {
                for (String otherService : serviceClasses) {
                    if (!otherService.equals(service) && content.contains(otherService)) {
                        serviceDeps.add(otherService);
                    }
                }
            }
            if (!serviceDeps.isEmpty()) {
                deps.put(service, serviceDeps);
            }
        }
        report.setDependencies(deps);
    }

    private void detectCircularDependencies(CartographyReport report) {
        Map<String, Set<String>> deps = report.getDependencies();
        List<List<String>> cycles = new ArrayList<>();

        for (String start : deps.keySet()) {
            Set<String> visited = new LinkedHashSet<>();
            List<String> path = new ArrayList<>();
            findCycles(start, start, deps, visited, path, cycles);
        }
        report.setCircularDependencies(cycles);
    }

    private void findCycles(String current, String target, Map<String, Set<String>> deps,
                             Set<String> visited, List<String> path, List<List<String>> cycles) {
        if (visited.contains(current)) return;
        visited.add(current);
        path.add(current);

        Set<String> neighbors = deps.getOrDefault(current, Set.of());
        for (String neighbor : neighbors) {
            if (neighbor.equals(target) && path.size() > 1) {
                List<String> cycle = new ArrayList<>(path);
                cycle.add(target);
                cycles.add(cycle);
            } else if (!visited.contains(neighbor)) {
                findCycles(neighbor, target, deps, visited, new ArrayList<>(path), cycles);
            }
        }
    }

    private void computeComplexity(CartographyReport report, Map<String, String> classContents) {
        for (Map.Entry<String, String> entry : classContents.entrySet()) {
            String content = entry.getValue();
            if (!content.contains("@Stateless") && !content.contains("@Service") &&
                    !content.contains("@UseCase") && !content.contains("@Stateful")) {
                continue;
            }

            ServiceComplexity sc = new ServiceComplexity(entry.getKey());
            sc.setMethodCount(countMethods(content));
            sc.setDependencyCount(report.getDependencies().getOrDefault(entry.getKey(), Set.of()).size());
            sc.setTransactionalCount(countOccurrences(content, "@Transactional"));
            sc.setDtoCount(countDtoReferences(content, classContents.keySet()));
            sc.setExceptionCount(countOccurrences(content, "throws "));
            sc.setLinesOfCode((int) content.lines().count());
            sc.calculateScore();

            report.getServiceComplexities().put(entry.getKey(), sc);
        }
    }

    private void detectGodClasses(CartographyReport report, Map<String, String> classContents, List<Path> javaFiles) {
        for (Map.Entry<String, String> entry : classContents.entrySet()) {
            int lineCount = (int) entry.getValue().lines().count();
            if (lineCount > GOD_CLASS_THRESHOLD) {
                int methodCount = countMethods(entry.getValue());
                report.getGodClasses().add(new GodClassInfo(entry.getKey(), lineCount, methodCount));
            }
        }
    }

    private void detectDeprecatedApis(CartographyReport report, Map<String, String> classContents) {
        Set<String> deprecatedPatterns = Set.of(
                "javax.ejb", "javax.jms", "javax.xml.ws", "javax.xml.bind",
                "sun.misc", "java.security.acl"
        );
        Set<String> found = new LinkedHashSet<>();
        for (String content : classContents.values()) {
            for (String pattern : deprecatedPatterns) {
                if (content.contains("import " + pattern)) {
                    found.add(pattern + " (deprecated in Java 11+)");
                }
            }
            if (content.contains("@Deprecated")) {
                Matcher m = CLASS_PATTERN.matcher(content);
                if (m.find()) {
                    found.add(m.group(1) + " (marked @Deprecated)");
                }
            }
        }
        report.setDeprecatedApis(new ArrayList<>(found));
    }

    private void generateRecommendations(CartographyReport report) {
        List<String> recs = new ArrayList<>();

        // Strategie basee sur la taille
        if (report.getTotalServices() > 20) {
            report.setSuggestedStrategy(CartographyReport.MigrationStrategy.STRANGLER_FIG);
            recs.add("Projet volumineux (" + report.getTotalServices() + " services) : migration progressive recommandee (Strangler Fig)");
        } else if (report.getTotalServices() > 5) {
            report.setSuggestedStrategy(CartographyReport.MigrationStrategy.STRANGLER_FIG);
            recs.add("Projet de taille moyenne : migration progressive recommandee");
        } else {
            report.setSuggestedStrategy(CartographyReport.MigrationStrategy.BIG_BANG);
            recs.add("Petit projet (" + report.getTotalServices() + " services) : migration Big Bang possible");
        }

        // God classes
        if (!report.getGodClasses().isEmpty()) {
            recs.add("Refactoriser " + report.getGodClasses().size() + " God Classes avant migration");
        }

        // Dependances circulaires
        if (!report.getCircularDependencies().isEmpty()) {
            recs.add("Resoudre " + report.getCircularDependencies().size() + " dependances circulaires");
        }

        // APIs deprecees
        if (!report.getDeprecatedApis().isEmpty()) {
            recs.add("Migrer " + report.getDeprecatedApis().size() + " APIs deprecees (javax.* -> jakarta.*)");
        }

        // Services critiques
        long criticalCount = report.getServiceComplexities().values().stream()
                .filter(sc -> sc.getComplexity() == CartographyReport.Complexity.CRITICAL)
                .count();
        if (criticalCount > 0) {
            recs.add("Attention : " + criticalCount + " services de complexite CRITICAL necessitent une attention particuliere");
        }

        // MDBs
        if (report.getTotalMdbs() > 0) {
            recs.add("Transformer " + report.getTotalMdbs() + " MDBs en listeners Spring (@EventListener ou @KafkaListener)");
        }

        report.setRecommendations(recs);
    }

    // ==================== UTILITY METHODS ====================

    private List<Path> findJavaFiles(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> !p.toString().contains("/test/"))
                    .toList();
        }
    }

    private String extractClassName(String content) {
        Matcher m = CLASS_PATTERN.matcher(content);
        return m.find() ? m.group(1) : null;
    }

    private List<String> extractImports(String content) {
        List<String> imports = new ArrayList<>();
        Matcher m = IMPORT_PATTERN.matcher(content);
        while (m.find()) {
            imports.add(m.group(2));
        }
        return imports;
    }

    private int countMethods(String content) {
        return (int) content.lines()
                .filter(line -> line.matches("\\s*(public|protected|private)\\s+.*\\(.*\\)\\s*\\{?.*"))
                .filter(line -> !line.contains("class ") && !line.contains("interface "))
                .count();
    }

    private int countOccurrences(String content, String pattern) {
        int count = 0;
        int idx = 0;
        while ((idx = content.indexOf(pattern, idx)) != -1) {
            count++;
            idx += pattern.length();
        }
        return count;
    }

    private int countDtoReferences(String content, Set<String> allClasses) {
        int count = 0;
        for (String cls : allClasses) {
            if (content.contains(cls) && !cls.equals(extractClassName(content))) {
                count++;
            }
        }
        return Math.min(count, 20); // Cap to avoid noise
    }

    private String sanitizeMermaidId(String name) {
        return name.replaceAll("[^a-zA-Z0-9]", "_");
    }
}
