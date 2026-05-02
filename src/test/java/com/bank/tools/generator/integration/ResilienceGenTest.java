package com.bank.tools.generator.integration;

import com.bank.tools.generator.engine.CodeGenerationEngine;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.parser.JsonAdapterParser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootTest
class ResilienceGenTest {

    @Autowired
    private JsonAdapterParser parser;

    @Autowired
    private CodeGenerationEngine engine;

    @Test
    void generateResilienceApi() throws Exception {
        String json = Files.readString(Path.of("/home/ubuntu/resilience-test.json"));
        ProjectAnalysisResult result = parser.parseFromString(json);
        
        Path outputDir = Path.of("/tmp/resilience-api");
        if (Files.exists(outputDir)) {
            new ProcessBuilder("rm", "-rf", outputDir.toString()).start().waitFor();
        }
        Files.createDirectories(outputDir);
        
        engine.generateProject(result, outputDir, true, "REST");
        
        System.out.println("API generated at: " + outputDir.resolve("generated-api"));
    }
}
