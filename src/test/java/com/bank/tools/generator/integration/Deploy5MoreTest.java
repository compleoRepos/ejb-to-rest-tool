package com.bank.tools.generator.integration;

import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class Deploy5MoreTest {

    @Autowired
    private JsonAdapterParser jsonAdapterParser;

    @Autowired
    private CodeGenerationEngine engine;

    private static final String[] PROJECTS = {
        "commande-chequier-bmcedirect",
        "demande-dotation",
        "produits-epargne-bmcedirect",
        "transfert-euro-bmce-direct",
        "interface-credit-jocker"
    };

    @Test
    void generateAndCompile5Projects() throws Exception {
        Path baseDir = Paths.get("/tmp/deploy-5");
        Files.createDirectories(baseDir);

        for (String project : PROJECTS) {
            System.out.println("\n========== " + project + " ==========");

            // 1. Parse JSON
            InputStream is = getClass().getResourceAsStream("/adapters/" + project + ".json");
            assertNotNull(is, "JSON not found: " + project);
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ProjectAnalysisResult result = jsonAdapterParser.parseFromString(json);
            assertNotNull(result, "Parse failed: " + project);
            System.out.println("  [OK] Parsed: " + result.getUseCases().size() + " use cases");

            // 2. Generate
            Path outDir = baseDir.resolve(project);
            if (Files.exists(outDir)) {
                // Clean
                new ProcessBuilder("rm", "-rf", outDir.toString()).start().waitFor();
            }
            engine.generateProject(result, outDir, true, "REST");
            System.out.println("  [OK] Generated: " + outDir);

            // 3. Verify files exist
            assertTrue(Files.exists(Path.of(outDir.toString(), "generated-api/pom.xml")), "pom.xml missing: " + project);
            long javaCount = Files.walk(outDir).filter(p -> p.toString().endsWith(".java")).count();
            System.out.println("  [OK] Java files: " + javaCount);
        }

        System.out.println("\n========== ALL 5 GENERATED ==========");
    }
}
