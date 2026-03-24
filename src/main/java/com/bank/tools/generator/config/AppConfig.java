package com.bank.tools.generator.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Configuration générale de l'application.
 * Initialise les répertoires de travail au démarrage.
 */
@Configuration
public class AppConfig {

    @Value("${app.upload.dir}")
    private String uploadDir;

    @Value("${app.output.dir}")
    private String outputDir;

    @PostConstruct
    public void init() throws IOException {
        Files.createDirectories(Path.of(uploadDir));
        Files.createDirectories(Path.of(outputDir));
    }

    public String getUploadDir() {
        return uploadDir;
    }

    public String getOutputDir() {
        return outputDir;
    }
}
