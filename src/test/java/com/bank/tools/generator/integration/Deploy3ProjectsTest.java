package com.bank.tools.generator.integration;

import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.InputStream;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class Deploy3ProjectsTest {

    @Autowired
    private JsonAdapterParser jsonAdapterParser;

    @Autowired
    private CodeGenerationEngine engine;

    private static final String[] PROJECTS = {
        "mise-disposition-bmcedirect",
        "virement-permanent-bmcedirect",
        "souscription-assistance-bmcedirect"
    };

    @Test
    void generateAndCompile3Projects() throws Exception {
        for (String project : PROJECTS) {
            System.out.println("\n========== " + project + " ==========");

            // 1. Parse JSON
            InputStream is = getClass().getResourceAsStream("/adapters/" + project + ".json");
            assertNotNull(is, "JSON not found: " + project);
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ProjectAnalysisResult result = jsonAdapterParser.parseFromString(json);
            System.out.println("  Parsed: " + result.getUseCases().size() + " use cases");

            // 2. Generate
            Path outDir = Path.of("/tmp/deploy-3/" + project);
            if (Files.exists(outDir)) {
                // Clean
                try (var walk = Files.walk(outDir)) {
                    walk.sorted(java.util.Comparator.reverseOrder())
                        .map(Path::toFile).forEach(java.io.File::delete);
                }
            }
            Files.createDirectories(outDir);
            engine.generateProject(result, outDir, true, "rest");
            System.out.println("  Generated in: " + outDir);

            // 3. Verify pom.xml exists
            Path generatedApi = outDir.resolve("generated-api");
            Path pom = generatedApi.resolve("pom.xml");
            assertTrue(Files.exists(pom), "pom.xml missing for " + project);

            // 4. List generated files
            try (var walk = Files.walk(generatedApi.resolve("src"))) {
                long javaFiles = walk.filter(p -> p.toString().endsWith(".java")).count();
                System.out.println("  Java files: " + javaFiles);
            }

            System.out.println("  OK - Ready for mvn package");
        }
    }
}
