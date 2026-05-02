package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.constants.GeneratorConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.bank.tools.generator.model.AdapterDescriptor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Génère les fichiers de configuration Spring Boot du projet REST :
 * Application, Properties, SecurityConfig, CorsConfig, EjbLookupConfig,
 * et le profil de déploiement WebSphere Liberty.
 */
@Component
public class ConfigGenerator {

    private static final Logger log = LoggerFactory.getLogger(ConfigGenerator.class);
    private static final String PKG = GeneratorConstants.DEFAULT_BASE_PACKAGE;

    public void generateAll(Path srcMain, Path resourcesDir, boolean hasXml) throws IOException {
        generateAll(srcMain, resourcesDir, hasXml, null);
    }

    public void generateAll(Path srcMain, Path resourcesDir, boolean hasXml,
                            AdapterDescriptor.SecurityConfig securityConfig) throws IOException {
        generateApplicationClass(srcMain);
        generateServletInitializer(srcMain);
        generateApplicationProperties(resourcesDir);
        if (securityConfig != null && securityConfig.getIssuerUri() != null) {
            generateKeycloakSecurityConfig(srcMain, securityConfig);
        } else {
            generateSecurityConfig(srcMain);
        }
        generateCorsConfig(srcMain);
        if (hasXml) {
            generateContentNegotiationConfig(srcMain);
        }
        generateProfiles(resourcesDir, securityConfig);
        generateLibertyConfig(srcMain, resourcesDir);
    }

    private void generateApplicationClass(Path srcMain) throws IOException {
        String code = """
                package %s;
                
                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;
                import org.springframework.scheduling.annotation.EnableAsync;
                
                @SpringBootApplication
                @EnableAsync
                public class Application {
                    public static void main(String[] args) {
                        SpringApplication.run(Application.class, args);
                    }
                }
                """.formatted(PKG);
        Files.writeString(srcMain.resolve("Application.java"), code);
    }

    /**
     * Génère le ServletInitializer pour le déploiement WAR (WebSphere Liberty).
     * Nécessaire pour que Spring Boot démarre dans un conteneur de servlets externe.
     */
    private void generateServletInitializer(Path srcMain) throws IOException {
        String code = """
                package %s;
                
                import org.springframework.boot.builder.SpringApplicationBuilder;
                import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
                
                /**
                 * Initializer pour le deploiement WAR sur WebSphere Liberty.
                 * Cette classe permet a Spring Boot de demarrer dans un conteneur de servlets externe
                 * au lieu d'utiliser le serveur embarque (Tomcat).
                 *
                 * Utilisation :
                 *   mvn clean package -Pliberty
                 *   Deployer le WAR genere dans le dossier dropins/ de Liberty.
                 */
                public class ServletInitializer extends SpringBootServletInitializer {
                
                    @Override
                    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
                        return application.sources(Application.class);
                    }
                }
                """.formatted(PKG);
        Files.writeString(srcMain.resolve("ServletInitializer.java"), code);
        log.info("ServletInitializer généré (déploiement WAR Liberty)");
    }

    private void generateApplicationProperties(Path resourcesDir) throws IOException {
        String props = """
                # Generated REST API
                server.port=8081
                spring.application.name=generated-rest-api
                
                # JNDI
                ejb.jndi.provider.url=${EJB_JNDI_URL:localhost:1099}
                ejb.jndi.factory=${EJB_JNDI_FACTORY:org.jboss.naming.remote.client.InitialContextFactory}
                
                # Logging
                logging.level.com.bank.api=DEBUG
                logging.pattern.console=%d{HH:mm:ss.SSS} [%thread] %-5level %logger{20} - %msg%n
                
                # Swagger
                springdoc.api-docs.path=/v3/api-docs
                springdoc.swagger-ui.path=/swagger-ui.html
                
                # Upload limits
                spring.servlet.multipart.max-file-size=50MB
                spring.servlet.multipart.max-request-size=50MB
                
                # Actuator
                management.endpoints.web.exposure.include=health,info,metrics
                """;
        Files.writeString(resourcesDir.resolve("application.properties"), props);
    }

    private void generateSecurityConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import org.springframework.context.annotation.Bean;
                import org.springframework.context.annotation.Configuration;
                import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
                import org.springframework.security.config.annotation.web.builders.HttpSecurity;
                import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
                import org.springframework.security.config.http.SessionCreationPolicy;
                import org.springframework.security.web.SecurityFilterChain;
                
                @Configuration
                @EnableWebSecurity
                @EnableMethodSecurity
                public class SecurityConfig {
                
                    @Bean
                    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
                        http
                            .csrf(csrf -> csrf.disable())
                            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                            .authorizeHttpRequests(auth -> auth
                                .requestMatchers("/api/v1/**").permitAll()
                                .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                                .requestMatchers("/actuator/**").permitAll()
                                .anyRequest().permitAll()
                            );
                        return http.build();
                    }
                }
                """.formatted(PKG);
        Files.writeString(srcMain.resolve("config/SecurityConfig.java"), code);
        log.info("SecurityConfig généré");
    }

    private void generateCorsConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import org.springframework.context.annotation.Configuration;
                import org.springframework.web.servlet.config.annotation.CorsRegistry;
                import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
                
                @Configuration
                public class CorsConfig implements WebMvcConfigurer {
                    @Override
                    public void addCorsMappings(CorsRegistry registry) {
                        registry.addMapping("/api/**")
                                .allowedOrigins("*")
                                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                                .allowedHeaders("*")
                                .maxAge(3600);
                    }
                }
                """.formatted(PKG);
        Files.writeString(srcMain.resolve("config/CorsConfig.java"), code);
    }

    private void generateContentNegotiationConfig(Path srcMain) throws IOException {
        String code = """
                package %s.config;
                
                import com.fasterxml.jackson.dataformat.xml.XmlMapper;
                import com.fasterxml.jackson.dataformat.xml.ser.ToXmlGenerator;
                import org.springframework.context.annotation.Bean;
                import org.springframework.context.annotation.Configuration;
                import org.springframework.http.MediaType;
                import org.springframework.http.converter.xml.MappingJackson2XmlHttpMessageConverter;
                import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
                import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
                
                @Configuration
                public class ContentNegotiationConfig implements WebMvcConfigurer {
                    @Override
                    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
                        configurer.favorParameter(true).parameterName("format")
                                .ignoreAcceptHeader(false)
                                .defaultContentType(MediaType.APPLICATION_JSON)
                                .mediaType("json", MediaType.APPLICATION_JSON)
                                .mediaType("xml", MediaType.APPLICATION_XML);
                    }
                
                    @Bean
                    public MappingJackson2XmlHttpMessageConverter xmlConverter() {
                        XmlMapper xmlMapper = XmlMapper.builder()
                                .configure(ToXmlGenerator.Feature.WRITE_XML_DECLARATION, true)
                                .build();
                        return new MappingJackson2XmlHttpMessageConverter(xmlMapper);
                    }
                }
                """.formatted(PKG);
        Files.writeString(srcMain.resolve("config/ContentNegotiationConfig.java"), code);
    }

    private void generateProfiles(Path resourcesDir, AdapterDescriptor.SecurityConfig securityConfig) throws IOException {
        // Profil JNDI (production EJB)
        Files.writeString(resourcesDir.resolve("application-jndi.properties"), """
                # Profil JNDI — Appelle les vrais EJBs via JBoss/WildFly
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                ejb.jndi.provider.url=${EJB_JNDI_URL:remote+http://serveur-ejb:8080}
                """);

        // Profil Mock (tests/démo) — OUVERT, pas de sécurité
        Files.writeString(resourcesDir.resolve("application-mock.properties"), """
                # Profil Mock — Données en dur, pas de JNDI, pas de sécurité
                logging.level.com.bank.api=INFO
                app.security.enabled=false
                """);

        // Profil Dev — OUVERT, pas de sécurité
        Files.writeString(resourcesDir.resolve("application-dev.properties"), """
                # Profil Dev — Développement local, pas de sécurité
                logging.level.com.bank.api=DEBUG
                app.security.enabled=false
                """);

        // Profil HTTP (futur microservices)
        Files.writeString(resourcesDir.resolve("application-http.properties"), """
                # Profil HTTP — Appelle les microservices REST
                # carte-service.url=http://carte-service:8080
                # compte-service.url=http://compte-service:8080
                """);

        // Profil test-e2e
        Files.writeString(resourcesDir.resolve("application-test-e2e.properties"), """
                # Profil test E2E — MockJndiContextFactory + vrais JndiAdapters
                ejb.jndi.factory=com.bank.api.infrastructure.mock.jndi.MockJndiContextFactory
                ejb.jndi.provider.url=mock://localhost
                app.security.enabled=false
                """);

        // Profils Qualif et Prod — SÉCURISÉS avec Keycloak/OAuth2
        if (securityConfig != null && securityConfig.getIssuerUri() != null) {
            String issuerUri = securityConfig.getIssuerUri();
            String jwkSetUri = securityConfig.getJwkSetUri() != null
                    ? securityConfig.getJwkSetUri()
                    : issuerUri + "/protocol/openid-connect/certs";

            String qualifProps = """
                    # Profil Qualif — Sécurisé avec Keycloak/OAuth2
                    app.security.enabled=true
                    spring.security.oauth2.resourceserver.jwt.issuer-uri=%s
                    spring.security.oauth2.resourceserver.jwt.jwk-set-uri=%s
                    logging.level.com.bank.api=INFO
                    logging.level.org.springframework.security=DEBUG
                    """.formatted(issuerUri, jwkSetUri);
            Files.writeString(resourcesDir.resolve("application-qualif.properties"), qualifProps);

            String prodProps = """
                    # Profil Prod — Sécurisé avec Keycloak/OAuth2
                    app.security.enabled=true
                    spring.security.oauth2.resourceserver.jwt.issuer-uri=%s
                    spring.security.oauth2.resourceserver.jwt.jwk-set-uri=%s
                    logging.level.com.bank.api=INFO
                    logging.level.org.springframework.security=WARN
                    """.formatted(issuerUri, jwkSetUri);
            Files.writeString(resourcesDir.resolve("application-prod.properties"), prodProps);

            log.info("Profils Keycloak générés (qualif, prod) avec issuer={}", issuerUri);
        }

        log.info("Profils Spring générés (jndi, mock, dev, http, test-e2e" +
                (securityConfig != null ? ", qualif, prod" : "") + ")");
    }

    // =====================================================================
    // WEBSPHERE LIBERTY — Profil de déploiement
    // =====================================================================

    /**
     * Génère les fichiers de configuration pour le déploiement sur WebSphere Liberty :
     * - application-liberty.properties (profil Spring)
     * - src/main/liberty/config/server.xml (configuration Liberty)
     * - src/main/liberty/config/jvm.options (options JVM)
     * - src/main/liberty/config/bootstrap.properties (bootstrap Liberty)
     */
    private void generateLibertyConfig(Path srcMain, Path resourcesDir) throws IOException {

        // 1. Profil Spring application-liberty.properties
        Files.writeString(resourcesDir.resolve("application-liberty.properties"), """
                # =====================================================================
                # Profil WebSphere Liberty
                # =====================================================================
                # Activer avec : --spring.profiles.active=liberty,jndi
                # Ou via la variable d'environnement : SPRING_PROFILES_ACTIVE=liberty,jndi
                
                # Desactiver le serveur embarque (Liberty fournit le conteneur de servlets)
                server.port=-1
                
                # JNDI — Liberty utilise le namespace par defaut (pas de remote)
                ejb.jndi.factory=com.ibm.websphere.naming.WsnInitialContextFactory
                ejb.jndi.provider.url=corbaloc:iiop:localhost:2809
                
                # Logging — Deleguer a Liberty (messages.log / trace.log)
                logging.level.root=INFO
                logging.level.com.bank.api=INFO
                
                # Actuator — Exposer health pour le monitoring Liberty
                management.endpoints.web.exposure.include=health,info,metrics
                management.endpoint.health.show-details=always
                
                # Swagger — Desactiver en production Liberty (utiliser API Discovery feature)
                springdoc.swagger-ui.enabled=${SWAGGER_ENABLED:false}
                springdoc.api-docs.enabled=${SWAGGER_ENABLED:false}
                """);

        // 2. Créer le répertoire Liberty config
        //    Convention Maven : src/main/liberty/config/
        Path libertyConfigDir = srcMain.resolve("../../../../liberty/config").normalize();
        // Résolution : srcMain = .../src/main/java/com/bank/api
        //   -> ../../../../ = .../src/main/
        //   -> liberty/config = .../src/main/liberty/config/
        // Recalculer proprement
        Path srcMainRoot = srcMain;
        // Remonter jusqu'à src/main/java puis aller à src/main/liberty/config
        String srcMainStr = srcMain.toString().replace("\\", "/");
        int javaIdx = srcMainStr.indexOf("src/main/java");
        Path libertyDir;
        if (javaIdx >= 0) {
            libertyDir = Path.of(srcMainStr.substring(0, javaIdx), "src/main/liberty/config");
        } else {
            libertyDir = srcMain.getParent().resolve("liberty/config");
        }
        Files.createDirectories(libertyDir);

        // 3. server.xml — Configuration Liberty
        Files.writeString(libertyDir.resolve("server.xml"), """
                <?xml version="1.0" encoding="UTF-8"?>
                <!--
                    WebSphere Liberty — Configuration du serveur
                    Generee automatiquement par Compleo DDF.
                    
                    Deploiement :
                      1. mvn clean package -Pliberty
                      2. Copier target/*.war dans ${server.config.dir}/dropins/
                      3. Ou utiliser : mvn liberty:run -Pliberty
                -->
                <server description="Generated REST API on Liberty">
                
                    <!-- ==================== Features ==================== -->
                    <featureManager>
                        <!-- Spring Boot 3.x sur Liberty -->
                        <feature>springBoot-3.0</feature>
                        <!-- Servlets Jakarta EE 10 -->
                        <feature>servlet-6.0</feature>
                        <!-- JNDI pour le lookup EJB -->
                        <feature>jndi-1.0</feature>
                        <!-- Transport SSL/TLS -->
                        <feature>transportSecurity-1.0</feature>
                        <!-- Health Check (MicroProfile) -->
                        <feature>mpHealth-4.0</feature>
                        <!-- Metriques (MicroProfile) -->
                        <feature>mpMetrics-5.0</feature>
                        <!-- JSON support -->
                        <feature>jsonp-2.1</feature>
                        <feature>jsonb-3.0</feature>
                    </featureManager>
                
                    <!-- ==================== HTTP Endpoints ==================== -->
                    <httpEndpoint id="defaultHttpEndpoint"
                                  host="*"
                                  httpPort="${http.port:9080}"
                                  httpsPort="${https.port:9443}" />
                
                    <!-- ==================== Application ==================== -->
                    <springBootApplication id="generated-rest-api"
                                           location="generated-rest-api-1.0.0-SNAPSHOT.war"
                                           name="generated-rest-api">
                        <!-- Context root de l'API -->
                        <classloader delegation="parentLast" />
                    </springBootApplication>
                
                    <!-- ==================== JNDI — Connexion au serveur EJB ==================== -->
                    <!--
                        Configurer les proprietes JNDI pour le lookup EJB distant.
                        Adapter provider.url selon votre environnement :
                        - WebSphere Traditional : corbaloc:iiop:hostname:2809
                        - WildFly/JBoss : remote+http://hostname:8080
                    -->
                    <jndiEntry jndiName="ejb/jndi/provider/url"
                               value="${env.EJB_JNDI_URL}" />
                    <jndiEntry jndiName="ejb/jndi/factory"
                               value="${env.EJB_JNDI_FACTORY}" />
                
                    <!-- ==================== Logging ==================== -->
                    <logging consoleLogLevel="INFO"
                             traceSpecification="com.bank.api.*=info"
                             maxFileSize="50"
                             maxFiles="10" />
                
                    <!-- ==================== SSL (optionnel) ==================== -->
                    <!--
                    <keyStore id="defaultKeyStore"
                              location="${server.config.dir}/resources/security/key.p12"
                              password="${keystore.password}" />
                    <ssl id="defaultSSLConfig"
                         keyStoreRef="defaultKeyStore"
                         sslProtocol="TLSv1.3" />
                    -->
                
                </server>
                """);

        // 4. jvm.options — Options JVM pour Liberty
        Files.writeString(libertyDir.resolve("jvm.options"), """
                # =====================================================================
                # JVM Options pour WebSphere Liberty
                # =====================================================================
                
                # Memoire heap (ajuster selon la charge)
                -Xms512m
                -Xmx1024m
                
                # Garbage Collector (G1GC recommande pour les API REST)
                -XX:+UseG1GC
                -XX:MaxGCPauseMillis=200
                
                # Encoding UTF-8
                -Dfile.encoding=UTF-8
                -Dclient.encoding.override=UTF-8
                
                # Profil Spring actif (liberty + jndi)
                -Dspring.profiles.active=liberty,jndi
                
                # Timezone
                -Duser.timezone=Africa/Casablanca
                
                # Desactiver le serveur embarque Spring Boot (Liberty fournit le conteneur)
                -Dspring.main.web-application-type=none
                """);

        // 5. bootstrap.properties — Propriétés de bootstrap Liberty
        Files.writeString(libertyDir.resolve("bootstrap.properties"), """
                # =====================================================================
                # Bootstrap Properties pour WebSphere Liberty
                # =====================================================================
                
                # Ports HTTP/HTTPS
                http.port=9080
                https.port=9443
                
                # Variables d'environnement JNDI (valeurs par defaut)
                # Surcharger via les variables d'environnement du serveur
                env.EJB_JNDI_URL=corbaloc:iiop:localhost:2809
                env.EJB_JNDI_FACTORY=com.ibm.websphere.naming.WsnInitialContextFactory
                """);

        log.info("Configuration WebSphere Liberty générée (server.xml, jvm.options, bootstrap.properties, application-liberty.properties)");
    }

    // =====================================================================
    // KEYCLOAK / OAUTH2 — SecurityConfig conditionné par profil
    // =====================================================================

    /**
     * Génère un SecurityConfig conditionné par profil :
     * - dev/mock : OUVERT (permitAll)
     * - qualif/prod : SÉCURISÉ avec OAuth2 Resource Server + JWT Keycloak
     */
    private void generateKeycloakSecurityConfig(Path srcMain, AdapterDescriptor.SecurityConfig sec) throws IOException {
        // 1. SecurityConfig principal (délègue au bon bean selon le profil)
        String mainConfig = """
                package %s.config;
                
                import org.springframework.beans.factory.annotation.Value;
                import org.springframework.context.annotation.Bean;
                import org.springframework.context.annotation.Configuration;
                import org.springframework.context.annotation.Profile;
                import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
                import org.springframework.security.config.annotation.web.builders.HttpSecurity;
                import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
                import org.springframework.security.config.http.SessionCreationPolicy;
                import org.springframework.security.oauth2.jwt.JwtDecoder;
                import org.springframework.security.oauth2.jwt.JwtDecoders;
                import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
                import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
                import org.springframework.security.web.SecurityFilterChain;
                
                /**
                 * Configuration de s\u00e9curit\u00e9 conditionn\u00e9e par profil Spring :
                 * - Profils dev, mock, test-e2e : API ouverte (permitAll)
                 * - Profils qualif, prod : API s\u00e9curis\u00e9e avec Keycloak OAuth2/JWT
                 *
                 * Activation : --spring.profiles.active=qualif,rest
                 */
                @Configuration
                @EnableWebSecurity
                @EnableMethodSecurity
                public class SecurityConfig {
                
                    // ==================== PROFILS OUVERTS (dev, mock, test-e2e) ====================
                
                    @Bean
                    @Profile({"dev", "mock", "test-e2e", "default"})
                    public SecurityFilterChain openFilterChain(HttpSecurity http) throws Exception {
                        http
                            .csrf(csrf -> csrf.disable())
                            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                            .authorizeHttpRequests(auth -> auth
                                .anyRequest().permitAll()
                            );
                        return http.build();
                    }
                
                    // ==================== PROFILS S\u00c9CURIS\u00c9S (qualif, prod) ====================
                
                    @Bean
                    @Profile({"qualif", "prod"})
                    public SecurityFilterChain securedFilterChain(HttpSecurity http) throws Exception {
                        http
                            .csrf(csrf -> csrf.disable())
                            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                            .authorizeHttpRequests(auth -> auth
                                .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                                .requestMatchers("/actuator/**").permitAll()
                                .requestMatchers("/api/v1/**").authenticated()
                                .anyRequest().denyAll()
                            )
                            .oauth2ResourceServer(oauth2 -> oauth2
                                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                            );
                        return http.build();
                    }
                
                    @Bean
                    @Profile({"qualif", "prod"})
                    public JwtAuthenticationConverter jwtAuthenticationConverter() {
                        JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter = new JwtGrantedAuthoritiesConverter();
                        grantedAuthoritiesConverter.setAuthoritiesClaimName("%s");
                        grantedAuthoritiesConverter.setAuthorityPrefix("ROLE_");
                
                        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
                        converter.setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter);
                        return converter;
                    }
                }
                """.formatted(PKG, sec.getRolesClaim() != null ? sec.getRolesClaim() : "realm_access.roles");

        Files.writeString(srcMain.resolve("config/SecurityConfig.java"), mainConfig);
        log.info("SecurityConfig Keycloak généré (ouvert en dev/mock, sécurisé en qualif/prod)");
    }
}
