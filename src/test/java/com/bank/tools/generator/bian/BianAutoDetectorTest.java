package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests de non-regression pour l'auto-detection BIAN.
 */
@DisplayName("BianAutoDetector - Auto-detection du mode BIAN")
class BianAutoDetectorTest {

    private BianAutoDetector detector;

    @BeforeEach
    void setUp() {
        detector = new BianAutoDetector();
    }

    @Test
    @DisplayName("Detecte un projet bancaire avec mots-cles BIAN")
    void detectsBianKeywordsInPackage() {
        ProjectAnalysisResult analysis = createAnalysis("com.bank.card.management", "CardActivation");
        BianAutoDetector.DetectionResult result = detector.detect(analysis);

        assertNotNull(result);
        assertTrue(result.getScore() > 0);
    }

    @Test
    @DisplayName("Score eleve pour un projet avec package bancaire")
    void highScoreForBankingPackage() {
        ProjectAnalysisResult analysis = createAnalysis("com.bank.payment.initiation", "InitiatePayment");
        BianAutoDetector.DetectionResult result = detector.detect(analysis);

        assertTrue(result.getScore() >= 30, "Score devrait etre >= 30 pour un package bancaire");
    }

    @Test
    @DisplayName("Score faible pour un projet non bancaire")
    void lowScoreForNonBankingProject() {
        ProjectAnalysisResult analysis = createAnalysis("com.example.todo", "CreateTodo");
        BianAutoDetector.DetectionResult result = detector.detect(analysis);

        assertTrue(result.getScore() < 50, "Score devrait etre < 50 pour un projet non bancaire");
    }

    @Test
    @DisplayName("La recommandation est coherente avec le score")
    void recommendationMatchesScore() {
        ProjectAnalysisResult analysis = createAnalysis("com.bank.account.management", "RetrieveAccount");
        BianAutoDetector.DetectionResult result = detector.detect(analysis);

        if (result.getScore() >= 60) {
            assertTrue(result.isRecommended());
        }
    }

    @Test
    @DisplayName("Gere un projet vide sans erreur")
    void handlesEmptyProject() {
        ProjectAnalysisResult analysis = new ProjectAnalysisResult();
        analysis.setUseCases(Collections.emptyList());
        analysis.setDtos(Collections.emptyList());

        BianAutoDetector.DetectionResult result = detector.detect(analysis);
        assertNotNull(result);
        assertEquals(0, result.getScore());
    }

    private ProjectAnalysisResult createAnalysis(String packageName, String className) {
        ProjectAnalysisResult analysis = new ProjectAnalysisResult();

        UseCaseInfo uc = new UseCaseInfo();
        uc.setClassName(className);
        uc.setPackageName(packageName);
        uc.setServiceAdapterName(className + "Adapter");
        uc.setControllerName(className + "Controller");
        analysis.setUseCases(List.of(uc));
        analysis.setDtos(new ArrayList<>());

        return analysis;
    }
}
