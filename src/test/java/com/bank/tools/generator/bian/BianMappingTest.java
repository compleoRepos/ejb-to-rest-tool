package com.bank.tools.generator.bian;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour BianMapping — Construction URLs BIAN,
 * méthodes HTTP et codes de statut.
 */
@DisplayName("BianMapping — Construction URLs BIAN")
class BianMappingTest {

    private BianMapping create(String serviceDomain, String action, String bq) {
        BianMapping m = new BianMapping();
        m.setServiceDomain(serviceDomain);
        m.setAction(action);
        m.setBehaviorQualifier(bq);
        return m;
    }

    // ===================== buildUrl =====================

    @Test void initiation_noId() {
        String url = create("current-account", "initiation", null).buildUrl("/api/v1");
        assertEquals("/api/v1/current-account/initiation", url);
        assertFalse(url.contains("{cr-reference-id}"));
    }

    @Test void evaluation_noId() {
        String url = create("loan", "evaluation", null).buildUrl("/api/v1");
        assertEquals("/api/v1/loan/evaluation", url);
        assertFalse(url.contains("{cr-reference-id}"));
    }

    @Test void notification_noId() {
        String url = create("customer-notification", "notification", null).buildUrl("/api/v1");
        assertEquals("/api/v1/customer-notification/notification", url);
        assertFalse(url.contains("{cr-reference-id}"));
    }

    @Test void retrieval_withId() {
        String url = create("party", "retrieval", null).buildUrl("/api/v1");
        assertTrue(url.contains("{cr-reference-id}"));
    }

    @Test void retrieval_withBQ() {
        String url = create("current-account", "retrieval", "balance").buildUrl("/api/v1");
        assertEquals("/api/v1/current-account/{cr-reference-id}/balance/retrieval", url);
    }

    @Test void execution_withBQ() {
        String url = create("card-management", "execution", "activation").buildUrl("/api/v1");
        assertEquals("/api/v1/card-management/{cr-reference-id}/activation/execution", url);
    }

    // ===================== getHttpMethod (via GeneratorConstants) =====================

    @Test void control_isPut() {
        BianMapping m = create("card-management", "control", "blocking");
        assertEquals("PUT", com.bank.tools.generator.engine.util.CodeGenUtils.getBianHttpMethod(m.getAction()));
    }

    @Test void update_isPut() {
        BianMapping m = create("party", "update", null);
        assertEquals("PUT", com.bank.tools.generator.engine.util.CodeGenUtils.getBianHttpMethod(m.getAction()));
    }

    @Test void termination_isPut() {
        BianMapping m = create("current-account", "termination", null);
        assertEquals("PUT", com.bank.tools.generator.engine.util.CodeGenUtils.getBianHttpMethod(m.getAction()));
    }

    // ===================== getHttpStatus (via GeneratorConstants) =====================

    @Test void initiation_is201() {
        BianMapping m = create("current-account", "initiation", null);
        assertEquals("201", com.bank.tools.generator.engine.util.CodeGenUtils.getBianSuccessStatus(m.getAction()));
    }

    @Test void notification_is201() {
        BianMapping m = create("customer-notification", "notification", null);
        assertEquals("201", com.bank.tools.generator.engine.util.CodeGenUtils.getBianSuccessStatus(m.getAction()));
    }

    @Test void retrieval_is200() {
        BianMapping m = create("party", "retrieval", null);
        assertEquals("200", com.bank.tools.generator.engine.util.CodeGenUtils.getBianSuccessStatus(m.getAction()));
    }
}
