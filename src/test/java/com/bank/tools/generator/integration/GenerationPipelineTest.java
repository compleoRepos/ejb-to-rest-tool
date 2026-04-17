package com.bank.tools.generator.integration;

import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.service.GeneratorService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.io.*;
import java.nio.file.*;
import java.util.zip.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test d'integration E2E — Pipeline complet :
 * cree un ZIP EJB minimal en memoire, upload, analyse, generation,
 * puis verifie la structure du projet genere.
 */
@SpringBootTest
@DisplayName("Pipeline E2E")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class GenerationPipelineTest {

    @Autowired
    private GeneratorService service;

    private static String projectId;
    private static ProjectAnalysisResult analysisResult;

    private MockMultipartFile createMinimalZip() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            addEntry(zos, "src/main/java/ma/eai/boa/usecases/BaseUseCase.java",
                "package ma.eai.boa.usecases;\npublic interface BaseUseCase { Object execute(Object v) throws Exception; }");
            addEntry(zos, "src/main/java/ma/eai/boa/annotations/UseCase.java",
                "package ma.eai.boa.annotations;\nimport java.lang.annotation.*;\n@Target(ElementType.TYPE) @Retention(RetentionPolicy.RUNTIME) public @interface UseCase {}");
            addEntry(zos, "src/main/java/ma/eai/boa/usecases/TestUC.java",
                "package ma.eai.boa.usecases;\nimport ma.eai.boa.annotations.UseCase;\n@UseCase\npublic class TestUC implements BaseUseCase { public Object execute(Object v) throws Exception { return null; } }");
            addEntry(zos, "src/main/java/ma/eai/boa/dto/TestVoIn.java",
                "package ma.eai.boa.dto;\nimport javax.xml.bind.annotation.*;\n@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)\npublic class TestVoIn implements java.io.Serializable { @XmlElement private String id; public String getId(){return id;} public void setId(String v){this.id=v;} }");
            addEntry(zos, "src/main/java/ma/eai/boa/dto/TestVoOut.java",
                "package ma.eai.boa.dto;\nimport javax.xml.bind.annotation.*;\n@XmlRootElement @XmlAccessorType(XmlAccessType.FIELD)\npublic class TestVoOut implements java.io.Serializable { @XmlElement private String result; public String getResult(){return result;} public void setResult(String v){this.result=v;} }");
            addEntry(zos, "pom.xml",
                "<?xml version=\"1.0\"?><project><modelVersion>4.0.0</modelVersion><groupId>ma.eai</groupId><artifactId>test</artifactId><version>1.0</version></project>");
        }
        return new MockMultipartFile("file", "test.zip", "application/zip", baos.toByteArray());
    }

    private void addEntry(ZipOutputStream zos, String name, String content) throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(content.getBytes());
        zos.closeEntry();
    }

    @Test
    @Order(1)
    void shouldUpload() throws Exception {
        projectId = service.uploadProject(createMinimalZip());
        assertNotNull(projectId, "L'upload doit retourner un projectId");
        assertTrue(service.projectExists(projectId), "Le projet doit exister apres upload");
    }

    @Test
    @Order(2)
    void shouldAnalyze() throws Exception {
        assertNotNull(projectId, "projectId doit etre defini par le test precedent");
        analysisResult = service.analyzeProject(projectId);
        assertNotNull(analysisResult, "L'analyse doit retourner un resultat");
        assertFalse(analysisResult.getUseCases().isEmpty(), "Au moins 1 UseCase doit etre detecte");
    }

    @Test
    @Order(3)
    void shouldGenerate() throws Exception {
        assertNotNull(projectId, "projectId doit etre defini");
        assertNotNull(analysisResult, "analysisResult doit etre defini");
        Path generated = service.generateProject(projectId, analysisResult, false);
        assertNotNull(generated, "La generation doit retourner un chemin");
        assertTrue(Files.exists(generated.resolve("pom.xml")), "pom.xml doit exister");
        assertTrue(Files.exists(generated.resolve("src/main/java")), "src/main/java doit exister");
    }
}
