package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Génère le fichier pom.xml du projet REST.
 * Extrait de CodeGenerationEngine pour respecter SRP.
 *
 * Inclut un profil Maven 'liberty' pour le déploiement sur WebSphere Liberty :
 *   mvn clean package -Pliberty  → produit un WAR déployable sur Liberty
 *   mvn liberty:run -Pliberty    → démarre Liberty en local avec le WAR
 */
@Component
public class PomGenerator {

    private static final Logger log = LoggerFactory.getLogger(PomGenerator.class);

    public void generate(Path projectRoot, ProjectAnalysisResult analysis) throws IOException {
        boolean hasXml = analysis.getUseCases().stream().anyMatch(UseCaseInfo::hasXmlSupport)
                || analysis.getDtos().stream().anyMatch(DtoInfo::hasJaxbAnnotations);

        boolean hasValidation = analysis.getDtos().stream()
                .flatMap(dto -> dto.getFields().stream())
                .anyMatch(DtoInfo.FieldInfo::isRequired);

        String javaVersion = analysis.getSourceJavaVersion() != null
                ? analysis.getSourceJavaVersion() : "21";

        StringBuilder deps = new StringBuilder();

        // Core dependencies (always present)
        deps.append(dep("org.springframework.boot", "spring-boot-starter-web", null));
        deps.append(dep("org.springframework.boot", "spring-boot-starter-aop", null));
        deps.append(dep("org.springframework.boot", "spring-boot-starter-actuator", null));
        deps.append(dep("org.springframework.boot", "spring-boot-starter-security", null));
        deps.append(dep("jakarta.platform", "jakarta.jakartaee-api", "10.0.0", "provided"));
        deps.append(dep("org.springdoc", "springdoc-openapi-starter-webmvc-ui", "2.5.0"));

        if (hasValidation) {
            deps.append(dep("org.springframework.boot", "spring-boot-starter-validation", null));
        }

        if (hasXml) {
            deps.append(dep("jakarta.xml.bind", "jakarta.xml.bind-api", "4.0.2"));
            deps.append(dep("org.glassfish.jaxb", "jaxb-runtime", "4.0.5"));
            deps.append(dep("com.fasterxml.jackson.dataformat", "jackson-dataformat-xml", null));
        }

        // Dépendances framework BOA/EAI (commentées, à activer si nécessaire)
        if (analysis.isHasFrameworkParentPom()) {
            deps.append("\n        <!-- Dépendances framework BOA/EAI (décommenter si déploiement dans l'écosystème EAI) -->\n");
            for (var fwDep : analysis.getFrameworkDependencies()) {
                deps.append("        <!-- <dependency><groupId>").append(fwDep.getGroupId())
                    .append("</groupId><artifactId>").append(fwDep.getArtifactId())
                    .append("</artifactId><version>").append(fwDep.getVersion())
                    .append("</version></dependency> -->\n");
            }
        }

        // Test dependencies
        deps.append(dep("org.springframework.boot", "spring-boot-starter-test", null, "test"));
        deps.append(dep("org.springframework.security", "spring-security-test", null, "test"));

        String pom = """
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0"
                         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                    <modelVersion>4.0.0</modelVersion>
                
                    <parent>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-parent</artifactId>
                        <version>3.2.5</version>
                        <relativePath/>
                    </parent>
                
                    <groupId>com.bank.api</groupId>
                    <artifactId>generated-rest-api</artifactId>
                    <version>1.0.0-SNAPSHOT</version>
                    <packaging>jar</packaging>
                    <name>Generated REST API</name>
                    <description>API REST generee par Compleo</description>
                
                    <properties>
                        <java.version>%s</java.version>
                        <liberty.var.http.port>9080</liberty.var.http.port>
                        <liberty.var.https.port>9443</liberty.var.https.port>
                    </properties>
                
                    <dependencies>
                %s
                    </dependencies>
                
                    <build>
                        <plugins>
                            <plugin>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-maven-plugin</artifactId>
                            </plugin>
                        </plugins>
                    </build>
                
                    <!-- ==================== PROFILS DE DEPLOIEMENT ==================== -->
                    <profiles>
                
                        <!-- Profil WebSphere Liberty -->
                        <!--
                            Utilisation :
                              mvn clean package -Pliberty    : Produit un WAR deployable
                              mvn liberty:run -Pliberty      : Demarre Liberty en local
                              mvn liberty:dev -Pliberty      : Mode developpement (hot reload)
                
                            Le WAR genere se deploie dans :
                              ${server.config.dir}/dropins/generated-rest-api-1.0.0-SNAPSHOT.war
                
                            Prerequis :
                              - Java 21+ (ou la version detectee du projet source)
                              - Liberty 23.0.0.12+ (pour springBoot-3.0 feature)
                        -->
                        <profile>
                            <id>liberty</id>
                            <packaging>war</packaging>
                            <dependencies>
                                <!-- Exclure Tomcat embarque (Liberty fournit le conteneur) -->
                                <dependency>
                                    <groupId>org.springframework.boot</groupId>
                                    <artifactId>spring-boot-starter-tomcat</artifactId>
                                    <scope>provided</scope>
                                </dependency>
                            </dependencies>
                            <build>
                                <plugins>
                                    <!-- Liberty Maven Plugin -->
                                    <plugin>
                                        <groupId>io.openliberty.tools</groupId>
                                        <artifactId>liberty-maven-plugin</artifactId>
                                        <version>3.10</version>
                                        <configuration>
                                            <serverName>defaultServer</serverName>
                                            <configDirectory>src/main/liberty/config</configDirectory>
                                            <runtimeArtifact>
                                                <groupId>io.openliberty</groupId>
                                                <artifactId>openliberty-runtime</artifactId>
                                                <version>24.0.0.1</version>
                                                <type>zip</type>
                                            </runtimeArtifact>
                                            <bootstrapProperties>
                                                <http.port>${liberty.var.http.port}</http.port>
                                                <https.port>${liberty.var.https.port}</https.port>
                                            </bootstrapProperties>
                                        </configuration>
                                    </plugin>
                                    <!-- Maven WAR Plugin -->
                                    <plugin>
                                        <groupId>org.apache.maven.plugins</groupId>
                                        <artifactId>maven-war-plugin</artifactId>
                                        <version>3.4.0</version>
                                        <configuration>
                                            <failOnMissingWebXml>false</failOnMissingWebXml>
                                        </configuration>
                                    </plugin>
                                </plugins>
                            </build>
                        </profile>
                
                    </profiles>
                
                </project>
                """.formatted(javaVersion, deps.toString());

        Files.writeString(projectRoot.resolve("pom.xml"), pom);
        log.info("pom.xml généré (XML: {}, Validation: {}, profil Liberty: oui)", hasXml, hasValidation);
    }

    private String dep(String groupId, String artifactId, String version) {
        return dep(groupId, artifactId, version, null);
    }

    private String dep(String groupId, String artifactId, String version, String scope) {
        StringBuilder sb = new StringBuilder();
        sb.append("        <dependency>\n");
        sb.append("            <groupId>").append(groupId).append("</groupId>\n");
        sb.append("            <artifactId>").append(artifactId).append("</artifactId>\n");
        if (version != null) sb.append("            <version>").append(version).append("</version>\n");
        if (scope != null) sb.append("            <scope>").append(scope).append("</scope>\n");
        sb.append("        </dependency>\n");
        return sb.toString();
    }
}
