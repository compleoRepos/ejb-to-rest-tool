package com.bank.tools.generator.compliance;

import com.bank.tools.generator.config.CompleoConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;

/**
 * Genere le composant DataMasker dans le projet cible.
 * Masque automatiquement les donnees sensibles (RIB, IBAN, numeros de carte, etc.)
 * dans les logs et les reponses API.
 */
@Component
public class DataMaskerGenerator {

    private static final Logger log = LoggerFactory.getLogger(DataMaskerGenerator.class);

    private CompleoConfig compleoConfig;

    @Autowired(required = false)
    public void setCompleoConfig(CompleoConfig compleoConfig) {
        this.compleoConfig = compleoConfig;
    }

    /**
     * Genere DataMasker.java dans le projet cible.
     */
    public void generate(Path outputDir, String basePackage) throws IOException {
        String packagePath = basePackage.replace('.', '/');
        Path complianceDir = outputDir.resolve("src/main/java/" + packagePath + "/compliance");
        Files.createDirectories(complianceDir);

        List<String> sensitiveFields = getSensitiveFields();

        StringBuilder code = new StringBuilder();
        code.append("package ").append(basePackage).append(".compliance;\n\n");
        code.append("import java.util.regex.Pattern;\n\n");
        code.append("/**\n");
        code.append(" * Utilitaire de masquage des donnees sensibles.\n");
        code.append(" * Conforme RGPD / Loi 09-08 (protection des donnees au Maroc).\n");
        code.append(" * Masque automatiquement : RIB, IBAN, numeros de carte, emails, telephones.\n");
        code.append(" */\n");
        code.append("public final class DataMasker {\n\n");
        code.append("    private DataMasker() {}\n\n");

        // Patterns
        code.append("    // Patterns de detection\n");
        code.append("    private static final Pattern IBAN_PATTERN = Pattern.compile(\"[A-Z]{2}\\\\d{2}[A-Z0-9]{10,30}\");\n");
        code.append("    private static final Pattern RIB_PATTERN = Pattern.compile(\"\\\\d{24}\");\n");
        code.append("    private static final Pattern CARD_PATTERN = Pattern.compile(\"\\\\d{4}[- ]?\\\\d{4}[- ]?\\\\d{4}[- ]?\\\\d{4}\");\n");
        code.append("    private static final Pattern EMAIL_PATTERN = Pattern.compile(\"[\\\\w.+-]+@[\\\\w.-]+\\\\.[a-zA-Z]{2,}\");\n");
        code.append("    private static final Pattern PHONE_PATTERN = Pattern.compile(\"(?:\\\\+212|0)[5-7]\\\\d{8}\");\n\n");

        // maskAll
        code.append("    /**\n");
        code.append("     * Masque toutes les donnees sensibles dans le texte.\n");
        code.append("     */\n");
        code.append("    public static String maskAll(String text) {\n");
        code.append("        if (text == null || text.isEmpty()) return text;\n");
        code.append("        String result = text;\n");
        code.append("        result = CARD_PATTERN.matcher(result).replaceAll(m -> maskKeepLast4(m.group()));\n");
        code.append("        result = IBAN_PATTERN.matcher(result).replaceAll(m -> maskKeepLast4(m.group()));\n");
        code.append("        result = RIB_PATTERN.matcher(result).replaceAll(m -> maskKeepLast4(m.group()));\n");
        code.append("        result = EMAIL_PATTERN.matcher(result).replaceAll(m -> maskEmail(m.group()));\n");
        code.append("        result = PHONE_PATTERN.matcher(result).replaceAll(m -> maskKeepLast4(m.group()));\n");
        code.append("        return result;\n");
        code.append("    }\n\n");

        // maskField
        code.append("    /**\n");
        code.append("     * Masque un champ specifique par nom.\n");
        code.append("     */\n");
        code.append("    public static String maskField(String fieldName, String value) {\n");
        code.append("        if (value == null || value.isEmpty()) return value;\n");
        code.append("        String lower = fieldName.toLowerCase();\n");

        for (String field : sensitiveFields) {
            code.append("        if (lower.contains(\"").append(field.toLowerCase()).append("\")) return maskKeepLast4(value);\n");
        }

        code.append("        return value;\n");
        code.append("    }\n\n");

        // Helper methods
        code.append("    private static String maskKeepLast4(String value) {\n");
        code.append("        if (value.length() <= 4) return \"****\";\n");
        code.append("        return \"*\".repeat(value.length() - 4) + value.substring(value.length() - 4);\n");
        code.append("    }\n\n");

        code.append("    private static String maskEmail(String email) {\n");
        code.append("        int atIndex = email.indexOf('@');\n");
        code.append("        if (atIndex <= 1) return \"***@\" + email.substring(atIndex + 1);\n");
        code.append("        return email.charAt(0) + \"***@\" + email.substring(atIndex + 1);\n");
        code.append("    }\n");

        code.append("}\n");

        Files.writeString(complianceDir.resolve("DataMasker.java"), code.toString());
        log.info("[DataMasker] Composant de masquage genere dans {}", complianceDir);
    }

    private List<String> getSensitiveFields() {
        if (compleoConfig != null) {
            return compleoConfig.getCompliance().getSensitiveFields();
        }
        return List.of("rib", "iban", "carte", "card", "pan", "cvv", "password", "secret", "token", "ssn", "cin");
    }
}
