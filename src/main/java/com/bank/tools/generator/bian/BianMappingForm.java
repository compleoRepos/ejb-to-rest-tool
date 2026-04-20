package com.bank.tools.generator.bian;

import java.util.*;

/**
 * Formulaire de mapping BIAN pour le binding Thymeleaf.
 * Contient la liste des entries editables et les listes de valeurs
 * pour les dropdowns (service domains, actions, etc.).
 */
public class BianMappingForm {

    private List<BianMappingEntry> entries = new ArrayList<>();

    public BianMappingForm() {}

    public BianMappingForm(List<BianMappingEntry> entries) {
        this.entries = entries != null ? entries : new ArrayList<>();
    }

    public List<BianMappingEntry> getEntries() { return entries; }
    public void setEntries(List<BianMappingEntry> entries) { this.entries = entries; }

    /**
     * Liste des Service Domains BIAN disponibles pour les dropdowns.
     */
    public static List<String> getAvailableServiceDomains() {
        return List.of(
            "current-account",
            "savings-account",
            "card-management",
            "payment-initiation",
            "payment-execution",
            "payment-order",
            "credit-facility",
            "loan",
            "deposit",
            "party",
            "party-reference-data-directory",
            "customer-offer",
            "customer-relationship-management",
            "document-management",
            "regulatory-compliance",
            "fraud-detection",
            "channel-activity-analysis",
            "transaction-authorization",
            "financial-message-gateway",
            "correspondent-bank",
            "trade-finance",
            "foreign-exchange",
            "securities-trading",
            "investment-portfolio",
            "customer-campaign-management",
            "product-directory",
            "servicing-mandate",
            "contact-center-management",
            "customer-access-entitlement"
        );
    }

    /**
     * Liste des BIAN Action Terms pour les dropdowns.
     */
    public static List<String> getAvailableActions() {
        return List.of(
            "initiation",
            "retrieval",
            "update",
            "execution",
            "termination",
            "evaluation",
            "notification",
            "control",
            "request",
            "exchange",
            "grant",
            "capture"
        );
    }

    /**
     * Liste des methodes HTTP pour les dropdowns.
     */
    public static List<String> getAvailableHttpMethods() {
        return List.of("GET", "POST", "PUT", "DELETE", "PATCH");
    }
}
