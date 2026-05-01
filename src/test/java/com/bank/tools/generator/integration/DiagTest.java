package com.bank.tools.generator.integration;
import com.bank.tools.generator.parser.JsonAdapterParser;
import com.bank.tools.generator.bian.BianAutoDetector;
import com.bank.tools.generator.model.*;
import org.junit.jupiter.api.Test;
import java.nio.file.*;

public class DiagTest {
    @Test
    void diag() throws Exception {
        JsonAdapterParser parser = new JsonAdapterParser(new BianAutoDetector());
        ProjectAnalysisResult result = parser.parse(Path.of("test-adapter.json"));
        for (UseCaseInfo uc : result.getUseCases()) {
            System.out.println("className=" + uc.getClassName() 
                + " bianMapping.bq=" + (uc.getBianMapping() != null ? uc.getBianMapping().getBehaviorQualifier() : "null")
                + " bianMapping.action=" + (uc.getBianMapping() != null ? uc.getBianMapping().getAction() : "null")
                + " inputDto=" + uc.getInputDtoClassName()
                + " outputDto=" + uc.getOutputDtoClassName());
        }
    }
}
