package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests du parseur EJB — Vérifie que l'analyse AST détecte correctement
 * les UseCases, DTOs, enums, exceptions et annotations.
 */
@SpringBootTest
@DisplayName("EjbProjectParser — Analyse AST")
class EjbProjectParserTest {

    @Autowired
    private EjbProjectParser parser;

    @TempDir
    Path tempDir;

    private Path createJavaFile(String packagePath, String fileName, String content) throws IOException {
        Path dir = tempDir.resolve("src/main/java/" + packagePath.replace('.', '/'));
        Files.createDirectories(dir);
        Path file = dir.resolve(fileName);
        Files.writeString(file, content);
        return file;
    }

    @Nested
    @DisplayName("Détection @UseCase")
    class UseCaseDetection {

        @Test
        @DisplayName("Détecte un UseCase avec @UseCase")
        void shouldDetectUseCaseAnnotation() throws IOException {
            createJavaFile("ma.eai.boa.xbanking.annotations", "UseCase.java", """
                package ma.eai.boa.xbanking.annotations;
                import java.lang.annotation.*;
                @Target(ElementType.TYPE) @Retention(RetentionPolicy.RUNTIME)
                public @interface UseCase {}
                """);

            createJavaFile("ma.eai.boa.xbanking.usecases", "BaseUseCase.java", """
                package ma.eai.boa.xbanking.usecases;
                public interface BaseUseCase {
                    Object execute(Object voIn) throws Exception;
                }
                """);

            createJavaFile("ma.eai.boa.xbanking.usecases", "ActiverCarteUC.java", """
                package ma.eai.boa.xbanking.usecases;
                import ma.eai.boa.xbanking.annotations.UseCase;
                @UseCase
                public class ActiverCarteUC implements BaseUseCase {
                    @Override
                    public Object execute(Object voIn) throws Exception {
                        return null;
                    }
                }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            assertFalse(result.getUseCases().isEmpty(), "Au moins 1 UseCase doit être détecté");
            UseCaseInfo uc = result.getUseCases().stream()
                    .filter(u -> u.getClassName().equals("ActiverCarteUC"))
                    .findFirst()
                    .orElse(null);
            assertNotNull(uc, "ActiverCarteUC doit être détecté");
            assertEquals(UseCaseInfo.EjbPattern.BASE_USE_CASE, uc.getEjbPattern());
        }

        @Test
        @DisplayName("Détecte un UseCase avec @Stateless")
        void shouldDetectStatelessAnnotation() throws IOException {
            createJavaFile("ma.eai.boa.xbanking.usecases", "BaseUseCase.java", """
                package ma.eai.boa.xbanking.usecases;
                public interface BaseUseCase {
                    Object execute(Object voIn) throws Exception;
                }
                """);

            createJavaFile("ma.eai.boa.xbanking.usecases", "SimulerCreditUC.java", """
                package ma.eai.boa.xbanking.usecases;
                import javax.ejb.Stateless;
                @Stateless
                public class SimulerCreditUC implements BaseUseCase {
                    @Override
                    public Object execute(Object voIn) throws Exception {
                        return null;
                    }
                }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            boolean found = result.getUseCases().stream()
                    .anyMatch(u -> u.getClassName().equals("SimulerCreditUC"));
            assertTrue(found, "SimulerCreditUC (@Stateless) doit être détecté");
        }
    }

    @Nested
    @DisplayName("Détection DTOs")
    class DtoDetection {

        @Test
        @DisplayName("Détecte un DTO avec @XmlRootElement")
        void shouldDetectJaxbDto() throws IOException {
            createJavaFile("ma.eai.boa.xbanking.dto", "ActiverCarteVoIn.java", """
                package ma.eai.boa.xbanking.dto;
                import javax.xml.bind.annotation.*;
                @XmlRootElement
                @XmlAccessorType(XmlAccessType.FIELD)
                public class ActiverCarteVoIn {
                    @XmlElement(required = true) private String numCarte;
                    @XmlElement private String codeActivation;
                    public String getNumCarte() { return numCarte; }
                    public void setNumCarte(String v) { this.numCarte = v; }
                    public String getCodeActivation() { return codeActivation; }
                    public void setCodeActivation(String v) { this.codeActivation = v; }
                }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            DtoInfo dto = result.getDtos().stream()
                    .filter(d -> d.getClassName().equals("ActiverCarteVoIn"))
                    .findFirst()
                    .orElse(null);
            assertNotNull(dto, "ActiverCarteVoIn doit être détecté");
            assertTrue(dto.hasJaxbAnnotations(), "Doit avoir des annotations JAXB");
            assertTrue(dto.getFields().stream().anyMatch(f -> f.getName().equals("numCarte") && f.isRequired()),
                    "numCarte doit être required");
        }
    }

    @Nested
    @DisplayName("Détection enums")
    class EnumDetection {

        @Test
        @DisplayName("Détecte un enum JAXB")
        void shouldDetectJaxbEnum() throws IOException {
            createJavaFile("ma.eai.boa.xbanking.enums", "StatutCarte.java", """
                package ma.eai.boa.xbanking.enums;
                import javax.xml.bind.annotation.*;
                @XmlType @XmlEnum
                public enum StatutCarte { ACTIVE, INACTIVE, BLOQUEE; }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            assertFalse(result.getDetectedEnums().isEmpty(), "Au moins 1 enum doit être détecté");
            assertTrue(result.getDetectedEnums().stream()
                    .anyMatch(e -> e.getName().equals("StatutCarte")),
                    "StatutCarte doit être détecté");
        }
    }

    @Nested
    @DisplayName("Détection exceptions")
    class ExceptionDetection {

        @Test
        @DisplayName("Détecte une exception custom extends FwkRollbackException")
        void shouldDetectCustomException() throws IOException {
            createJavaFile("ma.eai.midw.exceptions", "FwkRollbackException.java", """
                package ma.eai.midw.exceptions;
                public class FwkRollbackException extends Exception {
                    public FwkRollbackException(String m) { super(m); }
                }
                """);

            createJavaFile("ma.eai.boa.xbanking.exceptions", "CarteDejaActiveException.java", """
                package ma.eai.boa.xbanking.exceptions;
                import ma.eai.midw.exceptions.FwkRollbackException;
                public class CarteDejaActiveException extends FwkRollbackException {
                    public CarteDejaActiveException(String n) { super("Carte deja active : " + n); }
                }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            assertTrue(result.getDetectedExceptions().stream()
                    .anyMatch(e -> e.getName().equals("CarteDejaActiveException")),
                    "CarteDejaActiveException doit être détectée");
        }
    }

    @Nested
    @DisplayName("Détection validateurs")
    class ValidatorDetection {

        @Test
        @DisplayName("Détecte @ValidRIB + RIBValidator")
        void shouldDetectCustomValidator() throws IOException {
            createJavaFile("ma.eai.boa.xbanking.validation", "ValidRIB.java", """
                package ma.eai.boa.xbanking.validation;
                import javax.validation.Constraint;
                import javax.validation.Payload;
                import java.lang.annotation.*;
                @Target(ElementType.FIELD) @Retention(RetentionPolicy.RUNTIME)
                @Constraint(validatedBy = RIBValidator.class)
                public @interface ValidRIB {
                    String message() default "RIB invalide";
                    Class<?>[] groups() default {};
                    Class<? extends Payload>[] payload() default {};
                }
                """);

            createJavaFile("ma.eai.boa.xbanking.validation", "RIBValidator.java", """
                package ma.eai.boa.xbanking.validation;
                import javax.validation.ConstraintValidator;
                import javax.validation.ConstraintValidatorContext;
                public class RIBValidator implements ConstraintValidator<ValidRIB, String> {
                    @Override public boolean isValid(String v, ConstraintValidatorContext c) {
                        return v == null || v.length() == 24;
                    }
                }
                """);

            ProjectAnalysisResult result = parser.analyzeProject(tempDir);

            assertFalse(result.getDetectedValidators().isEmpty(), "Au moins 1 validateur doit être détecté");
            assertTrue(result.getDetectedValidators().stream()
                    .anyMatch(v -> v.getAnnotationName().equals("ValidRIB")),
                    "ValidRIB doit être détecté");
        }
    }
}
