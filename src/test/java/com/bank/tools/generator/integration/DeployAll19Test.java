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
public class DeployAll19Test {

    @Autowired
    private JsonAdapterParser jsonAdapterParser;

    @Autowired
    private CodeGenerationEngine engine;

    private static final String[] PROJECTS = {
        "activation-carte-bmcedirect",
        "avis-opere",
        "commande-chequier-bmcedirect",
        "coordonnees-3dsecure-bmcedirect",
        "demande-dotation",
        "interface-credit-jocker",
        "interface-send-sms",
        "mise-disposition-bmcedirect",
        "operation-avenir-services",
        "opposition-carte-bmcedirect",
        "produits-epargne-bmcedirect",
        "push-notification",
        "releve-carte-bmcedirect",
        "souscription-assistance-bmcedirect",
        "souscription-opv-bmcedirect",
        "tockenisation-carte-bmcedirect",
        "transfert-euro-bmce-direct",
        "vente-distance-carte-monetique",
        "virement-permanent-bmcedirect"
    };

    @Test
    void generateAll19() throws Exception {
        Path baseDir = Paths.get("/tmp/all-19");
        Files.createDirectories(baseDir);

        int ok = 0;
        for (String project : PROJECTS) {
            System.out.println("\n========== " + project + " ==========");
            try {
                InputStream is = getClass().getResourceAsStream("/adapters/" + project + ".json");
                assertNotNull(is, "JSON not found: " + project);
                String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                ProjectAnalysisResult result = jsonAdapterParser.parseFromString(json);
                assertNotNull(result);
                System.out.println("  Parsed: " + result.getUseCases().size() + " use cases");

                Path outDir = baseDir.resolve(project);
                if (Files.exists(outDir)) {
                    new ProcessBuilder("rm", "-rf", outDir.toString()).start().waitFor();
                }
                engine.generateProject(result, outDir, true, "REST");
                
                long javaCount = Files.walk(outDir).filter(p -> p.toString().endsWith(".java")).count();
                System.out.println("  Generated: " + javaCount + " Java files");
                ok++;
            } catch (Exception e) {
                System.out.println("  ERROR: " + e.getMessage());
            }
        }
        System.out.println("\n========== " + ok + "/" + PROJECTS.length + " GENERATED ==========");
        assertEquals(PROJECTS.length, ok);
    }
}
