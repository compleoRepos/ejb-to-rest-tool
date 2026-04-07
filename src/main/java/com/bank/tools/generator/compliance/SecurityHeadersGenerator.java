package com.bank.tools.generator.compliance;

import com.bank.tools.generator.config.CompleoConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;

/**
 * Genere le filtre SecurityHeaders dans le projet cible.
 * Ajoute automatiquement les headers de securite recommandes par OWASP :
 * X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.
 */
@Component
public class SecurityHeadersGenerator {

    private static final Logger log = LoggerFactory.getLogger(SecurityHeadersGenerator.class);

    private CompleoConfig compleoConfig;

    @Autowired(required = false)
    public void setCompleoConfig(CompleoConfig compleoConfig) {
        this.compleoConfig = compleoConfig;
    }

    /**
     * Genere SecurityHeadersFilter.java dans le projet cible.
     */
    public void generate(Path outputDir, String basePackage) throws IOException {
        String packagePath = basePackage.replace('.', '/');
        Path configDir = outputDir.resolve("src/main/java/" + packagePath + "/config");
        Files.createDirectories(configDir);

        String code = "package " + basePackage + ".config;\n\n"
                + "import org.springframework.core.Ordered;\n"
                + "import org.springframework.core.annotation.Order;\n"
                + "import org.springframework.stereotype.Component;\n\n"
                + "import javax.servlet.*;\n"
                + "import javax.servlet.http.HttpServletResponse;\n"
                + "import java.io.IOException;\n\n"
                + "/**\n"
                + " * Filtre de securite ajoutant les headers OWASP recommandes.\n"
                + " * Applique a toutes les reponses HTTP.\n"
                + " */\n"
                + "@Component\n"
                + "@Order(Ordered.HIGHEST_PRECEDENCE)\n"
                + "public class SecurityHeadersFilter implements Filter {\n\n"
                + "    @Override\n"
                + "    public void doFilter(ServletRequest request, ServletResponse response,\n"
                + "                          FilterChain chain) throws IOException, ServletException {\n"
                + "        HttpServletResponse httpResponse = (HttpServletResponse) response;\n\n"
                + "        // Prevent MIME type sniffing\n"
                + "        httpResponse.setHeader(\"X-Content-Type-Options\", \"nosniff\");\n\n"
                + "        // Prevent clickjacking\n"
                + "        httpResponse.setHeader(\"X-Frame-Options\", \"DENY\");\n\n"
                + "        // XSS protection\n"
                + "        httpResponse.setHeader(\"X-XSS-Protection\", \"1; mode=block\");\n\n"
                + "        // Content Security Policy\n"
                + "        httpResponse.setHeader(\"Content-Security-Policy\", \"default-src 'self'\");\n\n"
                + "        // HTTP Strict Transport Security (1 year)\n"
                + "        httpResponse.setHeader(\"Strict-Transport-Security\", \"max-age=31536000; includeSubDomains\");\n\n"
                + "        // Referrer Policy\n"
                + "        httpResponse.setHeader(\"Referrer-Policy\", \"strict-origin-when-cross-origin\");\n\n"
                + "        // Permissions Policy\n"
                + "        httpResponse.setHeader(\"Permissions-Policy\", \"camera=(), microphone=(), geolocation=()\");\n\n"
                + "        // Cache control for sensitive data\n"
                + "        httpResponse.setHeader(\"Cache-Control\", \"no-store, no-cache, must-revalidate\");\n"
                + "        httpResponse.setHeader(\"Pragma\", \"no-cache\");\n\n"
                + "        chain.doFilter(request, response);\n"
                + "    }\n"
                + "}\n";

        Files.writeString(configDir.resolve("SecurityHeadersFilter.java"), code);
        log.info("[SecurityHeaders] Filtre de securite genere dans {}", configDir);
    }
}
