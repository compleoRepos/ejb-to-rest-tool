package com.bank.tools.generator.compliance;

import com.bank.tools.generator.config.CompleoConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;

/**
 * Genere le composant AuditTrail dans le projet cible.
 * Produit un AuditInterceptor Spring qui journalise chaque appel REST
 * avec : utilisateur, action, timestamp, IP, payload masque.
 */
@Component
public class AuditTrailGenerator {

    private static final Logger log = LoggerFactory.getLogger(AuditTrailGenerator.class);

    private CompleoConfig compleoConfig;

    @Autowired(required = false)
    public void setCompleoConfig(CompleoConfig compleoConfig) {
        this.compleoConfig = compleoConfig;
    }

    /**
     * Genere AuditInterceptor.java et AuditLog.java dans le projet cible.
     */
    public void generate(Path outputDir, String basePackage) throws IOException {
        String packagePath = basePackage.replace('.', '/');
        Path auditDir = outputDir.resolve("src/main/java/" + packagePath + "/audit");
        Files.createDirectories(auditDir);

        generateAuditLog(auditDir, basePackage);
        generateAuditInterceptor(auditDir, basePackage);
        generateAuditConfig(auditDir, basePackage);

        log.info("[AuditTrail] Composants d'audit generes dans {}", auditDir);
    }

    private void generateAuditLog(Path dir, String basePackage) throws IOException {
        String code = "package " + basePackage + ".audit;\n\n"
                + "import java.time.LocalDateTime;\n\n"
                + "/**\n"
                + " * Entite representant une entree du journal d'audit.\n"
                + " * Conforme aux exigences reglementaires bancaires (BAM, ACPR).\n"
                + " */\n"
                + "public class AuditLog {\n\n"
                + "    private String id;\n"
                + "    private String username;\n"
                + "    private String action;\n"
                + "    private String method;\n"
                + "    private String endpoint;\n"
                + "    private String ipAddress;\n"
                + "    private int httpStatus;\n"
                + "    private long durationMs;\n"
                + "    private String requestBody;\n"
                + "    private String responseBody;\n"
                + "    private LocalDateTime timestamp;\n"
                + "    private String correlationId;\n\n"
                + "    public AuditLog() {\n"
                + "        this.timestamp = LocalDateTime.now();\n"
                + "        this.correlationId = java.util.UUID.randomUUID().toString();\n"
                + "    }\n\n"
                + "    // Getters and Setters\n"
                + "    public String getId() { return id; }\n"
                + "    public void setId(String id) { this.id = id; }\n"
                + "    public String getUsername() { return username; }\n"
                + "    public void setUsername(String username) { this.username = username; }\n"
                + "    public String getAction() { return action; }\n"
                + "    public void setAction(String action) { this.action = action; }\n"
                + "    public String getMethod() { return method; }\n"
                + "    public void setMethod(String method) { this.method = method; }\n"
                + "    public String getEndpoint() { return endpoint; }\n"
                + "    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }\n"
                + "    public String getIpAddress() { return ipAddress; }\n"
                + "    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }\n"
                + "    public int getHttpStatus() { return httpStatus; }\n"
                + "    public void setHttpStatus(int httpStatus) { this.httpStatus = httpStatus; }\n"
                + "    public long getDurationMs() { return durationMs; }\n"
                + "    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }\n"
                + "    public String getRequestBody() { return requestBody; }\n"
                + "    public void setRequestBody(String requestBody) { this.requestBody = requestBody; }\n"
                + "    public String getResponseBody() { return responseBody; }\n"
                + "    public void setResponseBody(String responseBody) { this.responseBody = responseBody; }\n"
                + "    public LocalDateTime getTimestamp() { return timestamp; }\n"
                + "    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }\n"
                + "    public String getCorrelationId() { return correlationId; }\n"
                + "    public void setCorrelationId(String correlationId) { this.correlationId = correlationId; }\n\n"
                + "    @Override\n"
                + "    public String toString() {\n"
                + "        return String.format(\"[AUDIT] %s | %s %s | user=%s | ip=%s | status=%d | %dms\",\n"
                + "                correlationId, method, endpoint, username, ipAddress, httpStatus, durationMs);\n"
                + "    }\n"
                + "}\n";

        Files.writeString(dir.resolve("AuditLog.java"), code);
    }

    private void generateAuditInterceptor(Path dir, String basePackage) throws IOException {
        String code = "package " + basePackage + ".audit;\n\n"
                + "import org.slf4j.Logger;\n"
                + "import org.slf4j.LoggerFactory;\n"
                + "import org.springframework.stereotype.Component;\n"
                + "import org.springframework.web.servlet.HandlerInterceptor;\n\n"
                + "import javax.servlet.http.HttpServletRequest;\n"
                + "import javax.servlet.http.HttpServletResponse;\n\n"
                + "/**\n"
                + " * Intercepteur Spring MVC pour le journal d'audit.\n"
                + " * Journalise automatiquement chaque appel REST entrant.\n"
                + " */\n"
                + "@Component\n"
                + "public class AuditInterceptor implements HandlerInterceptor {\n\n"
                + "    private static final Logger auditLogger = LoggerFactory.getLogger(\"AUDIT\");\n"
                + "    private static final ThreadLocal<AuditLog> CURRENT_AUDIT = new ThreadLocal<>();\n\n"
                + "    @Override\n"
                + "    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {\n"
                + "        AuditLog log = new AuditLog();\n"
                + "        log.setMethod(request.getMethod());\n"
                + "        log.setEndpoint(request.getRequestURI());\n"
                + "        log.setIpAddress(request.getRemoteAddr());\n"
                + "        log.setUsername(request.getUserPrincipal() != null ? request.getUserPrincipal().getName() : \"anonymous\");\n"
                + "        CURRENT_AUDIT.set(log);\n"
                + "        return true;\n"
                + "    }\n\n"
                + "    @Override\n"
                + "    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,\n"
                + "                                 Object handler, Exception ex) {\n"
                + "        AuditLog log = CURRENT_AUDIT.get();\n"
                + "        if (log != null) {\n"
                + "            log.setHttpStatus(response.getStatus());\n"
                + "            auditLogger.info(log.toString());\n"
                + "            CURRENT_AUDIT.remove();\n"
                + "        }\n"
                + "    }\n"
                + "}\n";

        Files.writeString(dir.resolve("AuditInterceptor.java"), code);
    }

    private void generateAuditConfig(Path dir, String basePackage) throws IOException {
        String code = "package " + basePackage + ".audit;\n\n"
                + "import org.springframework.beans.factory.annotation.Autowired;\n"
                + "import org.springframework.context.annotation.Configuration;\n"
                + "import org.springframework.web.servlet.config.annotation.InterceptorRegistry;\n"
                + "import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;\n\n"
                + "/**\n"
                + " * Configuration Spring MVC pour enregistrer l'intercepteur d'audit.\n"
                + " */\n"
                + "@Configuration\n"
                + "public class AuditConfig implements WebMvcConfigurer {\n\n"
                + "    @Autowired\n"
                + "    private AuditInterceptor auditInterceptor;\n\n"
                + "    @Override\n"
                + "    public void addInterceptors(InterceptorRegistry registry) {\n"
                + "        registry.addInterceptor(auditInterceptor)\n"
                + "                .addPathPatterns(\"/api/**\");\n"
                + "    }\n"
                + "}\n";

        Files.writeString(dir.resolve("AuditConfig.java"), code);
    }
}
