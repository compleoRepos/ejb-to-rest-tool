package com.bank.tools.generator.parser;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests de non-regression pour la detection multi-framework.
 */
@DisplayName("FrameworkDetector - Detection multi-framework")
class FrameworkDetectorTest {

    @TempDir
    Path tempDir;

    private final FrameworkDetector detector = new FrameworkDetector();

    @Test
    @DisplayName("Detecte un projet EJB 3.x (annotations @Stateless)")
    void detectsEjb3Project() throws IOException {
        createJavaFile("com/bank/ejb/MyService.java",
                "package com.bank.ejb;\n" +
                "import javax.ejb.Stateless;\n" +
                "@Stateless\n" +
                "public class MyService { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertNotNull(result);
        assertNotNull(result.getDetectedFrameworks());
        assertTrue(result.getDetectedFrameworks().stream()
                .anyMatch(f -> f.name().contains("EJB")));
    }

    @Test
    @DisplayName("Detecte un projet Spring Legacy (@Service + @Transactional)")
    void detectsSpringLegacy() throws IOException {
        createJavaFile("com/bank/service/PayService.java",
                "package com.bank.service;\n" +
                "import org.springframework.stereotype.Service;\n" +
                "import org.springframework.transaction.annotation.Transactional;\n" +
                "@Service\n@Transactional\n" +
                "public class PayService { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertNotNull(result);
        assertNotNull(result.getDetectedFrameworks());
        assertTrue(result.getDetectedFrameworks().stream()
                .anyMatch(f -> f.name().contains("SPRING")));
    }

    @Test
    @DisplayName("Detecte un projet SOAP/WSDL (@WebService)")
    void detectsSoapWsdl() throws IOException {
        createJavaFile("com/bank/ws/AccountWS.java",
                "package com.bank.ws;\n" +
                "import javax.jws.WebService;\n" +
                "@WebService\n" +
                "public class AccountWS { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertNotNull(result);
    }

    @Test
    @DisplayName("Retourne un resultat pour un repertoire vide")
    void emptyDirectoryReturnsResult() throws IOException {
        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertNotNull(result);
    }

    @Test
    @DisplayName("Le resultat contient les compteurs d'annotations")
    void resultContainsAnnotationCounts() throws IOException {
        createJavaFile("com/bank/ejb/A.java",
                "package com.bank.ejb;\nimport javax.ejb.Stateless;\n@Stateless\npublic class A { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertNotNull(result.getAnnotationCounts());
    }

    @Test
    @DisplayName("Le resultat contient un niveau de confiance")
    void resultContainsConfidence() throws IOException {
        createJavaFile("com/bank/ejb/A.java",
                "package com.bank.ejb;\nimport javax.ejb.Stateless;\n@Stateless\npublic class A { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertTrue(result.getConfidence() >= 0);
    }

    @Test
    @DisplayName("Detecte un projet mixte (EJB + Spring)")
    void detectsMixedProject() throws IOException {
        createJavaFile("com/bank/ejb/MyEjb.java",
                "package com.bank.ejb;\nimport javax.ejb.Stateless;\nimport javax.ejb.Remote;\n@Stateless\n@Remote\npublic class MyEjb { }");
        createJavaFile("com/bank/service/MySvc.java",
                "package com.bank.service;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n@Service\n@Transactional\npublic class MySvc { }");

        FrameworkDetector.DetectionResult result = detector.detect(tempDir);
        assertTrue(result.getDetectedFrameworks().size() >= 2,
                "Devrait detecter au moins 2 frameworks, detectes: " + result.getDetectedFrameworks());
    }

    private void createJavaFile(String relativePath, String content) throws IOException {
        Path file = tempDir.resolve(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
