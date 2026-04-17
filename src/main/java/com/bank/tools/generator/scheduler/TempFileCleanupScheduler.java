package com.bank.tools.generator.scheduler;

import com.bank.tools.generator.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Nettoyage automatique des fichiers temporaires.
 * Purge les projets uploadés et générés de plus de 24h.
 */
@Component
@EnableScheduling
public class TempFileCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(TempFileCleanupScheduler.class);

    /** Durée de rétention des fichiers temporaires (24h par défaut) */
    private static final Duration RETENTION = Duration.ofHours(24);

    private final AppConfig appConfig;

    public TempFileCleanupScheduler(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    /**
     * Purge les projets temporaires toutes les heures.
     * Supprime les répertoires de projets dont le dernier accès
     * date de plus de 24 heures.
     */
    @Scheduled(fixedRate = 3600_000) // 1 heure
    public void cleanupOldProjects() {
        Path uploadDir = Path.of(appConfig.getUploadDir());
        if (!Files.exists(uploadDir)) return;

        AtomicInteger deleted = new AtomicInteger(0);
        Instant cutoff = Instant.now().minus(RETENTION);

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(uploadDir)) {
            for (Path projectDir : stream) {
                if (!Files.isDirectory(projectDir)) continue;

                try {
                    BasicFileAttributes attrs = Files.readAttributes(projectDir, BasicFileAttributes.class);
                    if (attrs.lastModifiedTime().toInstant().isBefore(cutoff)) {
                        deleteDirectory(projectDir);
                        deleted.incrementAndGet();
                        log.info("[CLEANUP] Projet supprimé : {}", projectDir.getFileName());
                    }
                } catch (IOException e) {
                    log.warn("[CLEANUP] Impossible de vérifier/supprimer : {}", projectDir, e);
                }
            }
        } catch (IOException e) {
            log.error("[CLEANUP] Erreur lors du scan du répertoire : {}", uploadDir, e);
        }

        if (deleted.get() > 0) {
            log.info("[CLEANUP] {} projet(s) supprimé(s) (rétention : {}h)", deleted.get(), RETENTION.toHours());
        }
    }

    private void deleteDirectory(Path dir) throws IOException {
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                Files.delete(d);
                return FileVisitResult.CONTINUE;
            }
        });
    }
}
