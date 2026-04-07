package com.bank.tools.generator.parser;

import com.bank.tools.generator.config.CompleoConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

/**
 * Detecteur automatique du framework utilise dans un projet legacy.
 * Analyse les fichiers source pour determiner le type de framework :
 * - EJB_USECASE : Pattern UseCase BOA (BaseUseCase, @UseCase)
 * - JAVA_EE_STANDARD : @Stateless + @Remote multi-methodes
 * - SPRING_LEGACY : @Service + @Transactional
 * - SOAP_WSDL : Fichiers .wsdl detectes
 * - MIXED : Plusieurs frameworks detectes
 */
@Component
public class FrameworkDetector {

    private static final Logger log = LoggerFactory.getLogger(FrameworkDetector.class);

    private CompleoConfig compleoConfig;

    @Autowired(required = false)
    public void setCompleoConfig(CompleoConfig compleoConfig) {
        this.compleoConfig = compleoConfig;
    }

    public enum FrameworkType {
        EJB_USECASE("EJB UseCase (BOA Pattern)"),
        JAVA_EE_STANDARD("Java EE Standard (@Stateless + @Remote)"),
        SPRING_LEGACY("Spring Legacy (@Service + @Transactional)"),
        SOAP_WSDL("SOAP/WSDL Services"),
        MIXED("Multiple Frameworks Detected"),
        UNKNOWN("Unknown Framework");

        private final String label;

        FrameworkType(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }
    }

    /**
     * Resultat de la detection de framework.
     */
    public static class DetectionResult {
        private final FrameworkType primaryFramework;
        private final Set<FrameworkType> detectedFrameworks;
        private final Map<String, Integer> annotationCounts;
        private final int wsdlFileCount;
        private final int confidence;

        public DetectionResult(FrameworkType primaryFramework,
                               Set<FrameworkType> detectedFrameworks,
                               Map<String, Integer> annotationCounts,
                               int wsdlFileCount,
                               int confidence) {
            this.primaryFramework = primaryFramework;
            this.detectedFrameworks = detectedFrameworks;
            this.annotationCounts = annotationCounts;
            this.wsdlFileCount = wsdlFileCount;
            this.confidence = confidence;
        }

        public FrameworkType getPrimaryFramework() { return primaryFramework; }
        public Set<FrameworkType> getDetectedFrameworks() { return detectedFrameworks; }
        public Map<String, Integer> getAnnotationCounts() { return annotationCounts; }
        public int getWsdlFileCount() { return wsdlFileCount; }
        public int getConfidence() { return confidence; }

        @Override
        public String toString() {
            return String.format("Framework: %s (confidence: %d%%), detected: %s",
                    primaryFramework.getLabel(), confidence, detectedFrameworks);
        }
    }

    /**
     * Detecte le framework principal utilise dans le projet.
     */
    public DetectionResult detect(Path projectRoot) {
        Map<String, Integer> annotationCounts = new LinkedHashMap<>();
        Set<FrameworkType> detected = new LinkedHashSet<>();
        int wsdlCount = 0;

        List<String> useCaseAnnotations = getUseCaseAnnotations();

        try {
            // Compter les fichiers WSDL
            wsdlCount = countWsdlFiles(projectRoot);
            if (wsdlCount > 0) {
                detected.add(FrameworkType.SOAP_WSDL);
                annotationCounts.put("wsdl-files", wsdlCount);
            }

            // Scanner les fichiers Java
            List<Path> javaFiles = findJavaFiles(projectRoot);
            for (Path file : javaFiles) {
                String content = Files.readString(file);
                scanAnnotations(content, annotationCounts, detected, useCaseAnnotations);
            }
        } catch (IOException e) {
            log.warn("Erreur lors de la detection du framework : {}", e.getMessage());
        }

        // Determiner le framework principal
        FrameworkType primary = determinePrimary(detected, annotationCounts);
        int confidence = calculateConfidence(detected, annotationCounts);

        log.info("[FrameworkDetector] Detection : {} (confiance {}%)", primary.getLabel(), confidence);
        log.info("[FrameworkDetector] Annotations : {}", annotationCounts);

        return new DetectionResult(primary, detected, annotationCounts, wsdlCount, confidence);
    }

    private void scanAnnotations(String content, Map<String, Integer> counts,
                                  Set<FrameworkType> detected, List<String> useCaseAnnotations) {
        // EJB UseCase pattern
        for (String annotation : useCaseAnnotations) {
            if (content.contains("@" + annotation)) {
                counts.merge("@" + annotation, 1, Integer::sum);
                detected.add(FrameworkType.EJB_USECASE);
            }
        }
        if (content.contains("extends BaseUseCase") || content.contains("extends AbstractUseCase")) {
            counts.merge("BaseUseCase-extends", 1, Integer::sum);
            detected.add(FrameworkType.EJB_USECASE);
        }

        // Java EE Standard
        if (content.contains("@Stateless")) {
            counts.merge("@Stateless", 1, Integer::sum);
            if (content.contains("@Remote") || content.contains("implements") && content.contains("Remote")) {
                detected.add(FrameworkType.JAVA_EE_STANDARD);
            }
        }
        if (content.contains("@Remote")) {
            counts.merge("@Remote", 1, Integer::sum);
            detected.add(FrameworkType.JAVA_EE_STANDARD);
        }
        if (content.contains("@Stateful")) {
            counts.merge("@Stateful", 1, Integer::sum);
            detected.add(FrameworkType.JAVA_EE_STANDARD);
        }
        if (content.contains("@MessageDriven")) {
            counts.merge("@MessageDriven", 1, Integer::sum);
            detected.add(FrameworkType.JAVA_EE_STANDARD);
        }

        // Spring Legacy
        if (content.contains("@Service") && !content.contains("SynchroneService")) {
            counts.merge("@Service", 1, Integer::sum);
            if (content.contains("@Transactional")) {
                detected.add(FrameworkType.SPRING_LEGACY);
            }
        }
        if (content.contains("@Transactional")) {
            counts.merge("@Transactional", 1, Integer::sum);
        }
        if (content.contains("@Component") && content.contains("@Transactional")) {
            counts.merge("@Component+@Transactional", 1, Integer::sum);
            detected.add(FrameworkType.SPRING_LEGACY);
        }

        // SOAP indicators in Java
        if (content.contains("@WebService") || content.contains("@WebMethod")) {
            counts.merge("@WebService", 1, Integer::sum);
            detected.add(FrameworkType.SOAP_WSDL);
        }
    }

    private FrameworkType determinePrimary(Set<FrameworkType> detected, Map<String, Integer> counts) {
        if (detected.isEmpty()) return FrameworkType.UNKNOWN;
        if (detected.size() == 1) return detected.iterator().next();

        // Priorite : EJB_USECASE > JAVA_EE_STANDARD > SPRING_LEGACY > SOAP_WSDL
        if (detected.contains(FrameworkType.EJB_USECASE)) return FrameworkType.EJB_USECASE;
        if (detected.contains(FrameworkType.JAVA_EE_STANDARD)) return FrameworkType.JAVA_EE_STANDARD;
        if (detected.contains(FrameworkType.SPRING_LEGACY)) return FrameworkType.SPRING_LEGACY;
        if (detected.contains(FrameworkType.SOAP_WSDL)) return FrameworkType.SOAP_WSDL;

        return FrameworkType.MIXED;
    }

    private int calculateConfidence(Set<FrameworkType> detected, Map<String, Integer> counts) {
        if (detected.isEmpty()) return 0;
        int totalAnnotations = counts.values().stream().mapToInt(Integer::intValue).sum();
        if (detected.size() == 1 && totalAnnotations >= 3) return 95;
        if (detected.size() == 1) return 80;
        if (detected.size() == 2) return 70;
        return 50;
    }

    private int countWsdlFiles(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return (int) walk.filter(p -> p.toString().endsWith(".wsdl")).count();
        }
    }

    private List<Path> findJavaFiles(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(p -> p.toString().endsWith(".java")).toList();
        }
    }

    private List<String> getUseCaseAnnotations() {
        if (compleoConfig != null) {
            return compleoConfig.getLegacy().getUseCaseAnnotations();
        }
        return List.of("UseCase", "Stateless", "Service");
    }
}
