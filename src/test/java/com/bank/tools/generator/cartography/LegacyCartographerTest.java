package com.bank.tools.generator.cartography;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests de non-regression pour la cartographie legacy.
 */
@DisplayName("LegacyCartographer - Cartographie du patrimoine applicatif")
class LegacyCartographerTest {

    @TempDir
    Path tempDir;

    private LegacyCartographer cartographer;

    @BeforeEach
    void setUp() {
        cartographer = new LegacyCartographer();
    }

    @Test
    @DisplayName("Genere un rapport pour un projet avec des classes Java")
    void generatesReportForProject() throws IOException {
        createJavaFile("com/bank/ejb/AccountService.java",
                "package com.bank.ejb;\nimport javax.ejb.Stateless;\n@Stateless\npublic class AccountService {\n" +
                "    public String getAccount() { return null; }\n}");
        createJavaFile("com/bank/dto/AccountDto.java",
                "package com.bank.dto;\npublic class AccountDto { private String id; }");

        CartographyReport report = cartographer.analyze(tempDir);
        assertNotNull(report);
        assertTrue(report.getTotalClasses() >= 2);
    }

    @Test
    @DisplayName("Genere un graphe Mermaid non vide")
    void generatesMermaidGraph() throws IOException {
        createJavaFile("com/bank/ejb/A.java",
                "package com.bank.ejb;\npublic class A { }");
        createJavaFile("com/bank/ejb/B.java",
                "package com.bank.ejb;\npublic class B { private A a; }");

        CartographyReport report = cartographer.analyze(tempDir);
        String mermaid = cartographer.generateMermaidGraph(report);
        assertNotNull(mermaid);
        assertTrue(mermaid.contains("graph"));
    }

    @Test
    @DisplayName("Le rapport contient les dependances")
    void reportContainsDependencies() throws IOException {
        createJavaFile("com/bank/ejb/Service.java",
                "package com.bank.ejb;\npublic class Service { private Dao dao; }");
        createJavaFile("com/bank/ejb/Dao.java",
                "package com.bank.ejb;\npublic class Dao { }");

        CartographyReport report = cartographer.analyze(tempDir);
        assertNotNull(report.getDependencies());
    }

    @Test
    @DisplayName("Gere un repertoire vide sans erreur")
    void handlesEmptyDirectory() throws IOException {
        CartographyReport report = cartographer.analyze(tempDir);
        assertNotNull(report);
        assertEquals(0, report.getTotalClasses());
    }

    @Test
    @DisplayName("Genere un rapport Markdown")
    void generatesMarkdownReport() throws IOException {
        createJavaFile("com/bank/ejb/X.java",
                "package com.bank.ejb;\npublic class X { }");

        CartographyReport report = cartographer.analyze(tempDir);
        String md = cartographer.generateMarkdownReport(report);
        assertNotNull(md);
        assertTrue(md.length() > 0);
    }

    @Test
    @DisplayName("Genere un graphe vis.js HTML")
    void generatesVisJsGraph() throws IOException {
        createJavaFile("com/bank/ejb/Y.java",
                "package com.bank.ejb;\npublic class Y { }");

        CartographyReport report = cartographer.analyze(tempDir);
        String html = cartographer.generateVisJsGraph(report);
        assertNotNull(html);
        assertTrue(html.length() > 0);
    }

    private void createJavaFile(String relativePath, String content) throws IOException {
        Path file = tempDir.resolve(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
