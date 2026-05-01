package com.bank.tools.generator.integration;

import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Score Card : passe les 19 adapters JSON dans le pipeline Compleo,
 * compile chaque API generee et mesure le score global.
 */
@SpringBootTest
@DisplayName("Score Card - 19 Projets")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
public class ScoreCard19Test {

    @Autowired
    private JsonAdapterParser parser;

    @Autowired
    private CodeGenerationEngine engine;

    private static final Path ADAPTERS_DIR = Paths.get("src/test/resources/adapters");
    private static final Path OUTPUT_BASE = Paths.get("/tmp/score-card-19");

    private final List<ProjectResult> results = new ArrayList<>();

    @Test
    void scoreCard19Projects() throws Exception {
        // Nettoyer
        if (Files.exists(OUTPUT_BASE)) {
            Files.walkFileTree(OUTPUT_BASE, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                    Files.delete(dir);
                    return FileVisitResult.CONTINUE;
                }
            });
        }
        Files.createDirectories(OUTPUT_BASE);

        // Lister les 19 JSON
        List<Path> jsonFiles;
        try (var stream = Files.list(ADAPTERS_DIR)) {
            jsonFiles = stream
                    .filter(p -> p.toString().endsWith(".json"))
                    .sorted()
                    .collect(Collectors.toList());
        }

        System.out.println("Found " + jsonFiles.size() + " adapter JSON files\n");

        for (Path jsonFile : jsonFiles) {
            String name = jsonFile.getFileName().toString().replace(".json", "");
            System.out.println("=== " + name + " ===");

            ProjectResult result = new ProjectResult(name);

            try {
                // 1. Parse JSON
                String jsonContent = Files.readString(jsonFile);
                ProjectAnalysisResult analysis = parser.parseFromString(jsonContent);
                result.parsed = true;
                result.endpointCount = analysis.getUseCases().size();
                System.out.println("  PARSE OK: " + result.endpointCount + " use cases");

                // 2. Generate
                Path outputDir = OUTPUT_BASE.resolve(name);
                Path projectDir = engine.generateProject(analysis, outputDir, true, "REST");
                result.generated = true;
                System.out.println("  GENERATE OK -> " + projectDir);

                // 3. Check key files
                try (var walk = Files.walk(projectDir)) {
                    List<String> allFiles = walk.map(Path::toString).collect(Collectors.toList());
                    result.hasController = allFiles.stream().anyMatch(f -> f.endsWith("Controller.java"));
                    result.hasService = allFiles.stream().anyMatch(f -> f.endsWith("Service.java") && !f.contains("test"));
                    result.hasPom = Files.exists(projectDir.resolve("pom.xml"));
                    result.hasHealthIndicator = allFiles.stream().anyMatch(f -> f.contains("HealthIndicator"));
                }

                // 4. Compile
                result.compiled = compileProject(projectDir);
                System.out.println("  COMPILE: " + (result.compiled ? "OK" : "FAIL"));

                // 5. Check BIAN compliance
                if (result.hasController) {
                    try (var walk = Files.walk(projectDir)) {
                        String controllerContent = walk
                                .filter(p -> p.toString().endsWith("Controller.java"))
                                .findFirst()
                                .map(p -> {
                                    try { return Files.readString(p); }
                                    catch (IOException e) { return ""; }
                                })
                                .orElse("");

                        result.hasBianUrl = controllerContent.contains("@RequestMapping(\"/api/v1/");
                        result.hasBianBQ = controllerContent.contains("@PostMapping(\"") ||
                                           controllerContent.contains("@PutMapping(\"") ||
                                           controllerContent.contains("@GetMapping(\"");
                    }
                }

            } catch (Exception e) {
                result.error = e.getMessage();
                System.out.println("  ERROR: " + e.getMessage());
            }

            results.add(result);
            System.out.println();
        }

        // Print score card
        printScoreCard();
    }

    private boolean compileProject(Path projectDir) {
        try {
            ProcessBuilder pb = new ProcessBuilder("mvn", "compile", "-q", "-f", projectDir.resolve("pom.xml").toString());
            pb.redirectErrorStream(true);
            Process process = pb.start();

            String output;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                output = reader.lines().collect(Collectors.joining("\n"));
            }

            boolean finished = process.waitFor(120, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return false;
            }

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                // Print last 300 chars of output for debugging
                String tail = output.length() > 300 ? output.substring(output.length() - 300) : output;
                System.out.println("  COMPILE TAIL: " + tail);
            }
            return exitCode == 0;
        } catch (Exception e) {
            System.out.println("  COMPILE EXCEPTION: " + e.getMessage());
            return false;
        }
    }

    private void printScoreCard() {
        System.out.println("\n" + "=".repeat(90));
        System.out.println("SCORE CARD - 19 PROJETS");
        System.out.println("=".repeat(90));
        System.out.printf("%-42s %5s %5s %5s %5s %5s %7s%n",
                "PROJECT", "PARSE", "GEN", "COMP", "CTRL", "BIAN", "SCORE");
        System.out.println("-".repeat(90));

        int totalScore = 0;
        int maxScore = 0;

        for (ProjectResult r : results) {
            int score = 0;
            int max = 6;
            if (r.parsed) score++;
            if (r.generated) score++;
            if (r.compiled) score++;
            if (r.hasController) score++;
            if (r.hasBianUrl) score++;
            if (r.hasBianBQ) score++;

            totalScore += score;
            maxScore += max;

            System.out.printf("%-42s %5s %5s %5s %5s %5s %3d/%d%n",
                    r.name,
                    r.parsed ? "OK" : "FAIL",
                    r.generated ? "OK" : "FAIL",
                    r.compiled ? "OK" : "FAIL",
                    r.hasController ? "OK" : "FAIL",
                    r.hasBianUrl ? "OK" : "FAIL",
                    score, max);
        }

        System.out.println("-".repeat(90));
        int pct = maxScore > 0 ? (totalScore * 100 / maxScore) : 0;
        System.out.printf("TOTAL: %d/%d (%d%%)\n", totalScore, maxScore, pct);
        System.out.printf("Parsed:    %d/19\n", results.stream().filter(r -> r.parsed).count());
        System.out.printf("Generated: %d/19\n", results.stream().filter(r -> r.generated).count());
        System.out.printf("Compiled:  %d/19\n", results.stream().filter(r -> r.compiled).count());
        System.out.printf("BIAN OK:   %d/19\n", results.stream().filter(r -> r.hasBianUrl && r.hasBianBQ).count());
        System.out.println("=".repeat(90));

        // Write results to file
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("PROJECT,PARSE,GENERATE,COMPILE,CONTROLLER,BIAN_URL,BIAN_BQ,ENDPOINTS,SCORE\n");
            for (ProjectResult r : results) {
                int score = (r.parsed?1:0) + (r.generated?1:0) + (r.compiled?1:0) +
                            (r.hasController?1:0) + (r.hasBianUrl?1:0) + (r.hasBianBQ?1:0);
                sb.append(String.format("%s,%s,%s,%s,%s,%s,%s,%d,%d/6\n",
                        r.name, r.parsed, r.generated, r.compiled,
                        r.hasController, r.hasBianUrl, r.hasBianBQ,
                        r.endpointCount, score));
            }
            Files.writeString(Path.of("/tmp/score-card-19/results.csv"), sb.toString());
        } catch (Exception e) {
            System.out.println("Could not write CSV: " + e.getMessage());
        }
    }

    static class ProjectResult {
        String name;
        boolean parsed;
        boolean generated;
        boolean compiled;
        boolean hasController;
        boolean hasService;
        boolean hasPom;
        boolean hasHealthIndicator;
        boolean hasBianUrl;
        boolean hasBianBQ;
        int endpointCount;
        String error;

        ProjectResult(String name) {
            this.name = name;
        }
    }
}
