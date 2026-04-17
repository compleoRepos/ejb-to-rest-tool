package com.bank.tools.generator.bian;

import com.bank.tools.generator.model.UseCaseInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;
import com.bank.tools.generator.engine.util.CodeGenUtils;

/**
 * Resout le mapping BIAN pour chaque UseCase detecte.
 *
 * Strategie de resolution (3 niveaux) :
 * 1. Chercher un mapping explicite dans bian-mapping.yml
 * 2. Auto-detection intelligente via BianAutoDetector (analyse multi-criteres)
 * 3. Fallback YAML par mots-cles simples (retro-compatibilite)
 * 4. Fallback ultime : kebab-case du nom + action "execution"
 */
@Component
public class BianMappingResolver {

    private static final Logger log = LoggerFactory.getLogger(BianMappingResolver.class);

    private final BianMappingConfig config;
    private final BianAutoDetector autoDetector;

    public BianMappingResolver(BianMappingConfig config, BianAutoDetector autoDetector) {
        this.config = config;
        this.autoDetector = autoDetector;
    }

    // ===================== RESOLUTION PRINCIPALE =====================

    /**
     * Resout le mapping BIAN pour un UseCase donne (par nom uniquement).
     * Methode retro-compatible — conservee pour ne pas casser l'existant.
     *
     * @param useCaseName nom du UseCase (ex: "ActiverCarteUC")
     * @return le BianMapping resolu
     */
    public BianMapping resolve(String useCaseName) {
        if (!config.isLoaded()) {
            log.debug("[BianResolver] Config non chargee — fallback pour {}", useCaseName);
            return buildFallback(useCaseName);
        }

        // 1. Mapping explicite
        Optional<BianMapping> explicit = resolveExplicit(useCaseName);
        if (explicit.isPresent()) {
            log.info("[BianResolver] Mapping EXPLICITE pour {} → {}", useCaseName, explicit.get());
            return explicit.get();
        }

        // 2. Mapping automatique YAML (retro-compatible)
        BianMapping auto = resolveAutomatic(useCaseName);
        log.info("[BianResolver] Mapping AUTO pour {} → {}", useCaseName, auto);
        return auto;
    }

    /**
     * Resout le mapping BIAN pour un UseCase complet (avec metadonnees).
     * Utilise le BianAutoDetector pour une detection intelligente multi-criteres.
     *
     * @param useCase le UseCase complet avec package, VoIn, VoOut, methodes
     * @return le BianMapping resolu
     */
    public BianMapping resolve(UseCaseInfo useCase) {
        String useCaseName = useCase.getClassName();

        if (!config.isLoaded()) {
            log.debug("[BianResolver] Config non chargee — auto-detection pour {}", useCaseName);
            return autoDetector.autoDetect(useCase);
        }

        // 1. Mapping explicite (priorite absolue)
        Optional<BianMapping> explicit = resolveExplicit(useCaseName);
        if (explicit.isPresent()) {
            log.info("[BianResolver] Mapping EXPLICITE pour {} → {}", useCaseName, explicit.get());
            return explicit.get();
        }

        // 2. Auto-detection intelligente (BianAutoDetector)
        BianMapping autoDetected = autoDetector.autoDetect(useCase);
        int confidence = autoDetector.calculateConfidence(useCase, autoDetected);

        if (confidence >= 50) {
            log.info("[BianResolver] AUTO-DETECT pour {} → {} (confiance: {}%)", useCaseName, autoDetected, confidence);
            return autoDetected;
        }

        // 3. Fallback YAML par mots-cles simples (si confiance < 50%)
        BianMapping yamlAuto = resolveAutomatic(useCaseName);
        if (yamlAuto.getBianId() != null && !yamlAuto.getBianId().isEmpty()) {
            log.info("[BianResolver] YAML-AUTO pour {} → {} (auto-detect confiance trop basse: {}%)", useCaseName, yamlAuto, confidence);
            return yamlAuto;
        }

        // 4. Retourner l'auto-detection meme si confiance basse (mieux que le fallback kebab)
        log.warn("[BianResolver] AUTO-DETECT basse confiance pour {} → {} (confiance: {}%)", useCaseName, autoDetected, confidence);
        return autoDetected;
    }

    /**
     * Resout les mappings BIAN pour une liste de UseCases et les regroupe par Service Domain.
     *
     * @param useCaseNames liste des noms de UseCases
     * @return Map<serviceDomain, List<BianMapping>> regroupes
     */
    public Map<String, List<BianMapping>> resolveAndGroup(List<String> useCaseNames) {
        return useCaseNames.stream()
                .map(this::resolve)
                .collect(Collectors.groupingBy(
                        BianMapping::getServiceDomain,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));
    }

    /**
     * Resout les mappings BIAN pour une liste de UseCaseInfo et les regroupe par Service Domain.
     *
     * @param useCases liste des UseCaseInfo complets
     * @return Map<serviceDomain, List<BianMapping>> regroupes
     */
    public Map<String, List<BianMapping>> resolveAndGroupUseCases(List<UseCaseInfo> useCases) {
        return useCases.stream()
                .map(this::resolve)
                .collect(Collectors.groupingBy(
                        BianMapping::getServiceDomain,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));
    }

    // ===================== RESOLUTION EXPLICITE =====================

    private Optional<BianMapping> resolveExplicit(String useCaseName) {
        for (BianMappingConfig.ExplicitMapping em : config.getExplicitMappings()) {
            if (em.useCase.equals(useCaseName)) {
                BianMapping mapping = new BianMapping();
                mapping.setUseCaseName(useCaseName);
                mapping.setServiceDomain(em.serviceDomain);
                mapping.setBianId(em.bianId);
                mapping.setBehaviorQualifier(em.behaviorQualifier);
                mapping.setAction(em.action);
                mapping.setUrl(em.url);
                mapping.setHttpMethod(em.httpMethod);
                mapping.setHttpStatus(em.httpStatus);
                mapping.setSummary(em.summary);
                mapping.setExplicit(true);
                // Construire les derives (URL auto-construite si non specifiee dans le YAML)
                mapping.buildUrl(config.getBasePath());
                mapping.buildOperationId();
                mapping.buildTagName();
                mapping.buildTagDescription();
                return Optional.of(mapping);
            }
        }
        return Optional.empty();
    }

    // ===================== RESOLUTION AUTOMATIQUE (YAML) =====================

    private BianMapping resolveAutomatic(String useCaseName) {
        String nameLower = cleanUseCaseName(useCaseName).toLowerCase();

        // 1. Trouver le Service Domain par mots-cles
        String serviceDomain = null;
        String bianId = null;
        String behaviorQualifier = null;

        for (BianMappingConfig.KeywordDomainMapping kdm : config.getKeywordsToDomain()) {
            if (kdm.keywords.stream().anyMatch(nameLower::contains)) {
                serviceDomain = kdm.serviceDomain;
                bianId = kdm.bianId;
                behaviorQualifier = kdm.behaviorQualifier;
                break;
            }
        }

        // 2. Trouver l'action BIAN par mots-cles
        String action = null;
        String httpMethod = null;
        int httpStatus = 200;

        for (BianMappingConfig.KeywordActionMapping kam : config.getKeywordsToAction()) {
            if (kam.keywords.stream().anyMatch(nameLower::contains)) {
                action = kam.action;
                httpMethod = kam.httpMethod;
                httpStatus = kam.httpStatus;
                break;
            }
        }

        // 3. Fallback
        if (serviceDomain == null) {
            serviceDomain = CodeGenUtils.toKebabCase(cleanUseCaseName(useCaseName));
            log.warn("[BianResolver] Aucun Service Domain trouve pour {} — fallback: {}", useCaseName, serviceDomain);
        }
        if (action == null) {
            action = "execution";
            httpMethod = "POST";
        }
        if (httpMethod == null) {
            httpMethod = "POST";
        }

        // 4. Construire le mapping
        BianMapping mapping = new BianMapping();
        mapping.setUseCaseName(useCaseName);
        mapping.setServiceDomain(serviceDomain);
        mapping.setBianId(bianId != null ? bianId : "");
        mapping.setBehaviorQualifier(behaviorQualifier);
        mapping.setAction(action);
        mapping.setHttpMethod(httpMethod);
        mapping.setHttpStatus(httpStatus);
        mapping.setExplicit(false);
        mapping.setSummary(generateSummary(useCaseName, serviceDomain, action));

        // Construire les derives
        mapping.buildUrl(config.getBasePath());
        mapping.buildOperationId();
        mapping.buildTagName();
        mapping.buildTagDescription();

        return mapping;
    }

    // ===================== FALLBACK =====================

    private BianMapping buildFallback(String useCaseName) {
        BianMapping mapping = new BianMapping();
        mapping.setUseCaseName(useCaseName);
        mapping.setServiceDomain(CodeGenUtils.toKebabCase(cleanUseCaseName(useCaseName)));
        mapping.setBianId("");
        mapping.setAction("execution");
        mapping.setHttpMethod("POST");
        mapping.setHttpStatus(200);
        mapping.setExplicit(false);
        mapping.setSummary("Operation " + useCaseName);
        mapping.buildUrl("/api/v1");
        mapping.buildOperationId();
        mapping.buildTagName();
        mapping.buildTagDescription();
        return mapping;
    }

    // ===================== UTILITAIRES =====================

    /**
     * Nettoie le nom du UseCase : retire les suffixes UC, Impl, Service, Bean, etc.
     */
    private String cleanUseCaseName(String name) {
        return name.replaceAll("(UC|Impl|Service|Bean|Remote|Local|EJB|Handler)$", "")
                   .replaceAll("(UC|Impl|Service|Bean|Remote|Local|EJB|Handler)$", ""); // double pass
    }



    /**
     * Genere un resume automatique pour le mapping.
     */
    private String generateSummary(String useCaseName, String serviceDomain, String action) {
        String cleanName = cleanUseCaseName(useCaseName);
        String domainTitle = serviceDomain.replace("-", " ");
        domainTitle = domainTitle.substring(0, 1).toUpperCase() + domainTitle.substring(1);

        return switch (action) {
            case "initiation" -> "Initier une nouvelle instance de " + domainTitle + " (" + cleanName + ")";
            case "retrieval" -> "Consulter les informations de " + domainTitle + " (" + cleanName + ")";
            case "update" -> "Mettre a jour une instance de " + domainTitle + " (" + cleanName + ")";
            case "execution" -> "Executer l'operation " + cleanName + " sur " + domainTitle;
            case "termination" -> "Cloturer / Resilier une instance de " + domainTitle + " (" + cleanName + ")";
            case "evaluation" -> "Evaluer / Simuler une operation de " + domainTitle + " (" + cleanName + ")";
            case "notification" -> "Envoyer une notification via " + domainTitle + " (" + cleanName + ")";
            case "control" -> "Controler / Changer le statut de " + domainTitle + " (" + cleanName + ")";
            default -> "Operation " + cleanName + " sur " + domainTitle;
        };
    }
}
