package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.constants.GeneratorConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Génère les fichiers de configuration Spring Boot du projet REST :
 * Application, Properties, SecurityConfig, CorsConfig, EjbLookupConfig.
 */
@Component
public class ConfigGenerator {

    private static final Logger log = LoggerFactory.getLogger(ConfigGenerator.class);
    private static final String PKG = GeneratorConstants.DEFAULT_BASE_PACKAGE;

    public void generateAll(Path srcMain, Path resourcesDir, boolean hasXml) throws IOException {
        generateApplicationClass(srcMain);
        generateApplicationProperties(resourcesDir);
        generateSecurityConfig(srcMain);
        generateCorsConfig(srcMain);
        if (hasXml) {
            generateContentNegotiationConfig(srcMain);
        }
        generateProfiles(resourcesDir);
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

    private void generateProfiles(Path resourcesDir) throws IOException {
        // Profil JNDI (production EJB)
        Files.writeString(resourcesDir.resolve("application-jndi.properties"), """
                # Profil JNDI — Appelle les vrais EJBs via JBoss/WildFly
                ejb.jndi.factory=org.jboss.naming.remote.client.InitialContextFactory
                ejb.jndi.provider.url=${EJB_JNDI_URL:remote+http://serveur-ejb:8080}
                """);

        // Profil Mock (tests/démo)
        Files.writeString(resourcesDir.resolve("application-mock.properties"), """
                # Profil Mock — Données en dur, pas de JNDI
                logging.level.com.bank.api=INFO
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
                """);

        log.info("Profils Spring générés (jndi, mock, http, test-e2e)");
    }
}
