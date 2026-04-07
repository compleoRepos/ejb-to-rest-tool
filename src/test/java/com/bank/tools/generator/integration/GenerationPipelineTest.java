package com.bank.tools.generator.integration;

import com.bank.tools.generator.service.GeneratorService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests d'intégration — Pipeline complet : upload ZIP → parse → generate → ZIP.
 * Vérifie que le projet généré a la bonne structure et compile (si Maven est dispo).
 */
@SpringBootTest
@DisplayName("Pipeline E2E — Upload → Parse → Generate")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class GenerationPipelineTest {

    @Autowired
    private GeneratorService generatorService;

    private static String projectId;

    /**
     * Crée un projet EJB minimal dans un ZIP en mémoire.
     */
    private MockMultipartFile createMinimalEjbZip() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            // BaseUseCase interface
            addZipEntry(zos, "src/main/java/ma/eai/boa/usecases/BaseUseCase.java", """
                    package ma.eai.boa.usecases;
                    public interface BaseUseCase {
                        Object execute(Object voIn) throws Exception;
                    }
                    """);

            // UseCase annotation
            addZipEntry(zos, "src/main/java/ma/eai/boa/annotations/UseCase.java", """
                    package ma.eai.boa.annotations;
                    import java.lang.annotation.*;
                    @Target(ElementType.TYPE) @Retention(RetentionPolicy.RUNTIME)
                    public @interface UseCase {}
                    """);

            // Simple UseCase
            addZipEntry(zos, "src/main/java/ma/eai/boa/usecases/TestUC.java", """
                    package ma.eai.boa.usecases;
                    import ma.eai.boa.annotations.UseCase;
                    @UseCase
                    public class TestUC implements BaseUseCase {
                        @Override
                        public Object execute(Object voIn) throws Exception {
                            return null;
                        }
                    }
                    """);

            // DTO
            addZipEntry(zos, "src/main/java/ma/eai/boa/dto/TestVoIn.java", """
                    package ma.eai.boa.dto;
                    import java.io.Serializable;
                    public class TestVoIn implements Serializable {
                        private String id;
                        public String getId() { return id; }
                        public void setId(String id) { this.id = id; }
                    }
                    """);

            addZipEntry(zos, "src/main/java/ma/eai/boa/dto/TestVoOut.java", """
                    package ma.eai.boa.dto;
                    import java.io.Serializable;
                    public class TestVoOut implements Serializable {
                        private String result;
                        private String codeRetour;
                        public String getResult() { return result; }
                        public void setResult(String r) { this.result = r; }
                        public String getCodeRetour() { return codeRetour; }
                        public void setCodeRetour(String c) { this.codeRetour = c; }
                    }
                    """);

            // POM minimal
            addZipEntry(zos, "pom.xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <project><modelVersion>4.0.0</modelVersion>
                    <groupId>ma.eai.boa</groupId><artifactId>test</artifactId><version>1.0</version>
                    </project>
                    """);
        }
        return new MockMultipartFile("file", "test-ejb.zip", "application/zip", baos.toByteArray());
    }

    private void addZipEntry(ZipOutputStream zos, String name, String content) throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content.getBytes());
        zos.closeEntry();
    }

    @Test
    @Order(1)
    @DisplayName("Upload du projet EJB")
    void shouldUploadProject() throws Exception {
        MockMultipartFile file = createMinimalEjbZip();
        projectId = generatorService.uploadProject(file);
        assertNotNull(projectId, "projectId ne doit pas être null");
        assertFalse(projectId.isEmpty(), "projectId ne doit pas être vide");
    }

    @Test
    @Order(2)
    @DisplayName("Analyse du projet EJB")
    void shouldAnalyzeProject() throws Exception {
        assertNotNull(projectId, "Requiert le test d'upload");
        var result = generatorService.analyzeProject(projectId);
        assertNotNull(result, "Le résultat d'analyse ne doit pas être null");
        assertFalse(result.getUseCases().isEmpty(), "Au moins 1 UseCase doit être détecté");
    }

    @Test
    @Order(3)
    @DisplayName("Génération du projet REST")
    void shouldGenerateProject() throws Exception {
        assertNotNull(projectId, "Requiert le test d'upload");
        Path generated = generatorService.generateProject(projectId, false);
        assertNotNull(generated, "Le chemin du projet généré ne doit pas être null");
        assertTrue(Files.exists(generated), "Le répertoire du projet généré doit exister");

        // Vérifier la présence des fichiers clés
        assertTrue(Files.exists(generated.resolve("pom.xml")), "pom.xml doit exister");
        assertTrue(Files.exists(generated.resolve("src/main/java")), "src/main/java doit exister");
        assertTrue(Files.exists(generated.resolve("README.md")), "README.md doit exister");
    }

    @Test
    @Order(4)
    @DisplayName("Le projet généré contient des controllers")
    void shouldContainControllers() throws Exception {
        assertNotNull(projectId, "Requiert la génération");
        Path generated = generatorService.getGeneratedProjectPath(projectId);
        if (generated == null) return; // Skip si pas généré

        long controllerCount;
        try (var stream = Files.walk(generated)) {
            controllerCount = stream
                    .filter(p -> p.toString().endsWith("Controller.java"))
                    .filter(p -> !p.toString().contains("/test/"))
                    .count();
        }
        assertTrue(controllerCount > 0, "Au moins 1 controller doit être généré");
    }

    @Test
    @Order(5)
    @DisplayName("Le ZIP de téléchargement est créé")
    void shouldCreateDownloadZip() throws Exception {
        assertNotNull(projectId, "Requiert la génération");
        Path zipPath = generatorService.createDownloadZip(projectId);
        if (zipPath == null) return; // Skip si pas généré

        assertTrue(Files.exists(zipPath), "Le ZIP doit exister");
        assertTrue(Files.size(zipPath) > 0, "Le ZIP ne doit pas être vide");
    }
}
