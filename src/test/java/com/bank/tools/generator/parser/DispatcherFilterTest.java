package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour le filtre des dispatchers UCStrategie.
 * Verifie que les beans dispatchers (extends UCStrategie, process() passthrough,
 * nom commencant par minuscule + Bean) sont ignores par le parseur,
 * tandis que les vrais UseCases (implements BaseUseCase) sont detectes.
 */
@DisplayName("Filtre Dispatcher UCStrategie")
class DispatcherFilterTest {

    private EjbProjectParser parser;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        parser = new EjbProjectParser();
    }

    // ===================== HELPERS =====================

    private void writeJavaFile(String packagePath, String fileName, String content) throws IOException {
        Path dir = tempDir.resolve(packagePath.replace('.', '/'));
        Files.createDirectories(dir);
        Files.writeString(dir.resolve(fileName), content);
    }

    // ===================== TESTS =====================

    @Test
    @DisplayName("Le dispatcher UCStrategie (activationcartebmcedirectBean) est ignore")
    void shouldIgnoreUCStrategieDispatcher() throws IOException {
        // Dispatcher : extends UCStrategie, process() appelle super.process()
        writeJavaFile("ma.eai.boa.xbanking", "activationcartebmcedirectBean.java",
            "package ma.eai.boa.xbanking;\n" +
            "import javax.ejb.Stateless;\n" +
            "import javax.ejb.Remote;\n" +
            "public class activationcartebmcedirectBean extends UCStrategie implements SynchroneService {\n" +
            "    public Envelope process(Envelope envIn) {\n" +
            "        return super.process(envIn);\n" +
            "    }\n" +
            "}\n");

        // Vrai UseCase : implements BaseUseCase
        writeJavaFile("ma.eai.boa.xbanking.usecases", "ActiverCarteUC.java",
            "package ma.eai.boa.xbanking.usecases;\n" +
            "import ma.eai.boa.xbanking.usecases.UseCase;\n" +
            "@UseCase\n" +
            "public class ActiverCarteUC implements BaseUseCase {\n" +
            "    public Object execute(Object input) {\n" +
            "        return null;\n" +
            "    }\n" +
            "}\n");

        ProjectAnalysisResult result = parser.analyzeProject(tempDir);

        // Le dispatcher ne doit PAS etre dans les UseCases
        assertFalse(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().contains("bmcedirect")),
                "Le dispatcher UCStrategie ne doit pas etre un UseCase");

        // Le vrai UseCase DOIT etre detecte
        assertTrue(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().equals("ActiverCarteUC")),
                "Le vrai UseCase ActiverCarteUC doit etre detecte");
    }

    @Test
    @DisplayName("Un bean avec nom minuscule + Bean est ignore (convention BOA)")
    void shouldIgnoreLowercaseBeanConvention() throws IOException {
        // Bean avec nom commencant par minuscule et finissant par Bean
        writeJavaFile("ma.eai.boa.xbanking", "miseDispositionBean.java",
            "package ma.eai.boa.xbanking;\n" +
            "import javax.ejb.Stateless;\n" +
            "@Stateless\n" +
            "public class miseDispositionBean {\n" +
            "    public void doSomething() {}\n" +
            "}\n");

        ProjectAnalysisResult result = parser.analyzeProject(tempDir);

        assertFalse(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().equals("miseDispositionBean")),
                "Un bean avec nom minuscule + Bean ne doit pas etre un UseCase");
    }

    @Test
    @DisplayName("Un vrai @Stateless avec nom normal est conserve")
    void shouldKeepNormalStatelessBean() throws IOException {
        writeJavaFile("ma.eai.boa.xbanking", "TransferService.java",
            "package ma.eai.boa.xbanking;\n" +
            "import javax.ejb.Stateless;\n" +
            "@Stateless\n" +
            "public class TransferService {\n" +
            "    public String transfer(String from, String to) {\n" +
            "        return \"OK\";\n" +
            "    }\n" +
            "}\n");

        ProjectAnalysisResult result = parser.analyzeProject(tempDir);

        assertTrue(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().equals("TransferService")),
                "Un @Stateless normal doit etre detecte comme UseCase");
    }

    @Test
    @DisplayName("Un @Stateless implements SynchroneService AVEC process() metier est conserve")
    void shouldKeepSynchroneServiceWithBusinessLogic() throws IOException {
        // SynchroneService avec du vrai code metier (pas juste super.process())
        writeJavaFile("ma.eai.boa.xbanking", "PaymentProcessor.java",
            "package ma.eai.boa.xbanking;\n" +
            "import javax.ejb.Stateless;\n" +
            "@Stateless\n" +
            "public class PaymentProcessor implements SynchroneService {\n" +
            "    public Envelope process(Envelope envIn) {\n" +
            "        // Business logic here\n" +
            "        String action = envIn.getAction();\n" +
            "        return new Envelope();\n" +
            "    }\n" +
            "}\n");

        ProjectAnalysisResult result = parser.analyzeProject(tempDir);

        // Ce bean a du vrai code metier, il doit etre conserve
        assertTrue(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().equals("PaymentProcessor")),
                "Un SynchroneService avec logique metier doit etre conserve");
    }

    @Test
    @DisplayName("Projet complet : 3 vrais UseCases + 1 dispatcher = 3 detectes")
    void shouldDetectOnlyRealUseCasesInCompleteProject() throws IOException {
        // Dispatcher
        writeJavaFile("ma.eai.boa.xbanking", "activationcartebmcedirectBean.java",
            "package ma.eai.boa.xbanking;\n" +
            "import javax.ejb.Stateless;\n" +
            "public class activationcartebmcedirectBean extends UCStrategie implements SynchroneService {\n" +
            "    public Envelope process(Envelope envIn) {\n" +
            "        return super.process(envIn);\n" +
            "    }\n" +
            "}\n");

        // UseCase 1
        writeJavaFile("ma.eai.boa.xbanking.usecases", "ActiverCarteUC.java",
            "package ma.eai.boa.xbanking.usecases;\n" +
            "@UseCase\n" +
            "public class ActiverCarteUC implements BaseUseCase {\n" +
            "    public Object execute(Object input) { return null; }\n" +
            "}\n");

        // UseCase 2
        writeJavaFile("ma.eai.boa.xbanking.usecases", "ChargerClientDataUC.java",
            "package ma.eai.boa.xbanking.usecases;\n" +
            "@UseCase\n" +
            "public class ChargerClientDataUC implements BaseUseCase {\n" +
            "    public Object execute(Object input) { return null; }\n" +
            "}\n");

        // UseCase 3
        writeJavaFile("ma.eai.boa.xbanking.usecases", "ReceptionnerCarteUC.java",
            "package ma.eai.boa.xbanking.usecases;\n" +
            "@UseCase\n" +
            "public class ReceptionnerCarteUC implements BaseUseCase {\n" +
            "    public Object execute(Object input) { return null; }\n" +
            "}\n");

        ProjectAnalysisResult result = parser.analyzeProject(tempDir);

        // 3 vrais UseCases, pas 4
        long useCaseCount = result.getUseCases().stream()
                .filter(uc -> !uc.getClassName().contains("bmcedirect"))
                .count();
        assertEquals(3, useCaseCount,
                "Seuls les 3 vrais UseCases doivent etre detectes, pas le dispatcher");

        // Verifier que le dispatcher n'est pas present
        assertFalse(result.getUseCases().stream()
                .anyMatch(uc -> uc.getClassName().contains("bmcedirect")),
                "Le dispatcher ne doit pas apparaitre dans les UseCases");
    }
}
