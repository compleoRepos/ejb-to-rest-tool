package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.AdapterDescriptor;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SecurityParseTest {

    @Autowired
    private JsonAdapterParser parser;

    @Test
    void testSecurityBlockParsed() throws Exception {
        String json = Files.readString(Path.of("/home/ubuntu/test-keycloak.json"));
        ProjectAnalysisResult result = parser.parseFromString(json);

        assertNotNull(result.getAdapterDescriptor(), "AdapterDescriptor should not be null");
        AdapterDescriptor.SecurityConfig sec = result.getAdapterDescriptor().getSecurity();
        assertNotNull(sec, "SecurityConfig should not be null");
        assertEquals("keycloak", sec.getType());
        assertEquals("http://keycloak.bank.local:8080/realms/bank-realm", sec.getIssuerUri());
        assertEquals("payment-api-client", sec.getClientId());
        assertEquals("realm_access.roles", sec.getRolesClaim());

        System.out.println("Security parsing: ALL PASS");
    }
}
