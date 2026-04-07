package com.bank.tools.generator.parser;

import com.bank.tools.generator.annotation.AnnotationPropagator;
import com.bank.tools.generator.bian.BianMapping;
import com.bank.tools.generator.bian.BianMappingResolver;
import com.bank.tools.generator.annotation.CustomAnnotationRegistry;
import com.bank.tools.generator.annotation.DetectedAnnotation;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.bank.tools.generator.model.UseCaseInfo.SerializationFormat;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumConstantDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ReturnStmt;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Parseur statique de projets EJB utilisant JavaParser.
 * Supporte :
 * - G4 : Types EJB varies (@Stateless, @Stateful, @Singleton, @MessageDriven)
 * - G5 : Patterns EJB (BaseUseCase, Remote/Local, DAO, Service generique)
 * - G6 : Mapping HTTP intelligent (GET/POST/PUT/DELETE/PATCH + codes HTTP)
 * - G10 : Detection de toutes les annotations EJB source
 * - G11 : Extraction de la Javadoc pour Swagger
 * - G12 : Generation d'URLs REST intelligentes
 * - G14 : Metadonnees projet (entites JPA, conversions javax->jakarta)
 * - JAXB : Detection complete (@XmlRootElement, @XmlElement, @XmlElementWrapper, etc.)
 * - BUG 1 : Filtrage serialVersionUID et champs static final
 * - BUG 6 : Detection required=true sur @XmlElement/@XmlAttribute
 */
@Component
public class EjbProjectParser {

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private static final Logger log = LoggerFactory.getLogger(EjbProjectParser.class);

    private static final String BASE_USE_CASE_INTERFACE = "BaseUseCase";
    private static final String EXECUTE_METHOD_NAME = "execute";

    /** Annotations JAXB connues au niveau de la classe */
    private static final Set<String> JAXB_CLASS_ANNOTATIONS = Set.of(
            "XmlRootElement", "XmlType", "XmlAccessorType", "XmlSeeAlso"
    );

    /** Annotations JAXB connues au niveau des champs */
    private static final Set<String> JAXB_FIELD_ANNOTATIONS = Set.of(
            "XmlElement", "XmlAttribute", "XmlTransient", "XmlElementWrapper",
            "XmlElements", "XmlValue", "XmlList", "XmlAnyElement"
    );

    /** G4 : Annotations EJB reconnues (standard + custom BOA/EAI) */
    private static final Set<String> EJB_ANNOTATIONS = Set.of(
            "Stateless", "Stateful", "Singleton", "MessageDriven",
            "UseCase",    // Custom BOA/EAI — equivalent de @Stateless dans le framework interne
            "Service"     // Spring @Service — certains UC utilisent @Service au lieu de @Stateless
    );

    /** Packages framework EAI connus (dependances Maven, pas code source) */
    private static final Set<String> FRAMEWORK_PACKAGE_PREFIXES = Set.of(
            "ma.eai.", "com.eai.", "ma.boa.", "com.boa."
    );

    /** Types framework EAI connus (resolus par Maven, pas a recopier) */
    private static final Set<String> FRAMEWORK_TYPES = Set.of(
            "Envelope", "Parser", "ParsingException", "UtilHash",
            "SynchroneService", "Services", "Log", "EaiLog",
            "FwkRollbackException", "BaseUseCase", "ValueObject"
    );

    /** G6 : Mapping nom de methode → [HTTP_METHOD, STATUS_CODE] */
    private static final Map<String, String[]> HTTP_METHOD_PATTERNS = new LinkedHashMap<>();
    static {
        HTTP_METHOD_PATTERNS.put("find", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("get", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("search", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("list", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("fetch", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("load", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("read", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("check", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("is", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("has", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("count", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("charger", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("consulter", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("rechercher", new String[]{"GET", "200"});
        HTTP_METHOD_PATTERNS.put("create", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("add", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("insert", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("register", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("open", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("save", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("souscri", new String[]{"POST", "201"});
        HTTP_METHOD_PATTERNS.put("update", new String[]{"PUT", "200"});
        HTTP_METHOD_PATTERNS.put("modify", new String[]{"PUT", "200"});
        HTTP_METHOD_PATTERNS.put("edit", new String[]{"PUT", "200"});
        HTTP_METHOD_PATTERNS.put("change", new String[]{"PUT", "200"});
        HTTP_METHOD_PATTERNS.put("set", new String[]{"PUT", "200"});
        HTTP_METHOD_PATTERNS.put("patch", new String[]{"PATCH", "200"});
        HTTP_METHOD_PATTERNS.put("partialUpdate", new String[]{"PATCH", "200"});
        HTTP_METHOD_PATTERNS.put("delete", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("remove", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("close", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("cancel", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("disable", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("deactivate", new String[]{"DELETE", "204"});
        HTTP_METHOD_PATTERNS.put("execute", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("process", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("run", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("perform", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("transfer", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("send", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("submit", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("validate", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("approve", new String[]{"POST", "200"});
        HTTP_METHOD_PATTERNS.put("reject", new String[]{"POST", "200"});
    }

    /** G6 : Mots-cles pour determiner le code HTTP des BaseUseCase */
    private static final String[] CREATION_KEYWORDS = {
            "Create", "Add", "Register", "Open", "Insert", "Souscri", "Save", "Ouvrir"
    };
    private static final String[] DELETION_KEYWORDS = {
            "Delete", "Remove", "Close", "Cancel", "Disable", "Deactivate", "Supprimer", "Fermer"
    };
    private static final String[] CONSULTATION_KEYWORDS = {
            "Charger", "Consulter", "Rechercher", "Get", "Find", "Search", "List",
            "Fetch", "Load", "Read", "Check", "Balance", "History", "Data", "Lire"
    };
    private static final String[] UPDATE_KEYWORDS = {
            "Update", "Modify", "Edit", "Change", "Set", "Modifier"
    };

    private final JavaParser javaParser = new JavaParser();

    /** Module de detection et classification des annotations custom bancaires */
    private AnnotationPropagator annotationPropagator;

    /** Module de resolution du mapping BIAN pour chaque UseCase */
    private BianMappingResolver bianMappingResolver;

    private CustomAnnotationRegistry annotationRegistry;

    /** Injection optionnelle (le parseur peut fonctionner sans le module annotations) */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAnnotationPropagator(AnnotationPropagator annotationPropagator) {
        this.annotationPropagator = annotationPropagator;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAnnotationRegistry(CustomAnnotationRegistry annotationRegistry) {
        this.annotationRegistry = annotationRegistry;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setBianMappingResolver(BianMappingResolver bianMappingResolver) {
        this.bianMappingResolver = bianMappingResolver;
    }

    // ==================== MAIN ANALYSIS METHOD ====================

    /**
     * Analyse un projet EJB situe dans le repertoire donne.
     */
    public ProjectAnalysisResult analyzeProject(Path projectPath) {
        log.info("Debut de l'analyse du projet EJB : {}", projectPath);

        ProjectAnalysisResult result = new ProjectAnalysisResult();
        result.setProjectPath(projectPath.toString());

        // G14 : Detecter les metadonnees du projet
        detectProjectMetadata(projectPath, result);

        // Trouver tous les fichiers Java
        List<Path> javaFiles = findJavaFiles(projectPath);
        result.setTotalFilesAnalyzed(javaFiles.size());
        log.info("Nombre de fichiers Java trouves : {}", javaFiles.size());

        // Phase 1 : Parser tous les fichiers et construire un index
        Map<String, CompilationUnit> compilationUnits = new LinkedHashMap<>();
        Map<String, ClassOrInterfaceDeclaration> classIndex = new LinkedHashMap<>();

        for (Path javaFile : javaFiles) {
            try {
                ParseResult<CompilationUnit> parseResult = javaParser.parse(javaFile);
                if (parseResult.isSuccessful() && parseResult.getResult().isPresent()) {
                    CompilationUnit cu = parseResult.getResult().get();
                    compilationUnits.put(javaFile.toString(), cu);

                    // G3/G14 : Detecter les imports javax.*
                    cu.getImports().forEach(imp -> {
                        String importName = imp.getNameAsString();
                        if (importName.startsWith("javax.")) {
                            result.setHasLegacyJavaxImports(true);
                        }
                        // BOA/EAI : Detecter les imports framework (ma.eai.*, com.eai.*, etc.)
                        for (String prefix : FRAMEWORK_PACKAGE_PREFIXES) {
                            if (importName.startsWith(prefix)) {
                                result.addFrameworkImport(importName);
                                break;
                            }
                        }
                    });

                    cu.findAll(ClassOrInterfaceDeclaration.class).forEach(classDecl -> {
                        String fqn = getFullyQualifiedName(cu, classDecl);
                        classIndex.put(fqn, classDecl);
                    });
                } else {
                    result.addWarning("Impossible de parser : " + javaFile.getFileName());
                }
            } catch (IOException e) {
                result.addWarning("Erreur de lecture : " + javaFile.getFileName() + " - " + e.getMessage());
            }
        }

        // Phase 2 : Detecter les EJBs (G4 : tous les types), entites JPA, et DTOs
        Set<String> dtoClassNames = new HashSet<>();

        for (Map.Entry<String, CompilationUnit> entry : compilationUnits.entrySet()) {
            CompilationUnit cu = entry.getValue();

            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                // G14 : Detecter les entites JPA
                if (hasAnnotation(classDecl, "Entity")) {
                    result.setJpaEntityCount(result.getJpaEntityCount() + 1);
                    result.getJpaEntityNames().add(classDecl.getNameAsString());
                    continue;
                }

                // G4 : Detecter les EJBs (tous types)
                UseCaseInfo.EjbType ejbType = detectEjbType(classDecl);
                if (ejbType != null) {
                    // G4 : MessageDriven → transformer en composant event-driven Spring
                    if (ejbType == UseCaseInfo.EjbType.MESSAGE_DRIVEN) {
                        UseCaseInfo mdbInfo = extractMdbInfo(cu, classDecl);
                        if (mdbInfo != null) {
                            classDecl.getAnnotations().forEach(ann ->
                                    mdbInfo.getSourceAnnotations().add(ann.getNameAsString()));
                            classDecl.getJavadocComment().ifPresent(jd ->
                                    mdbInfo.setJavadoc(jd.getContent().trim()));
                            mdbInfo.setSwaggerSummary(generateSwaggerSummary(mdbInfo.getClassName()));
                            result.addUseCase(mdbInfo);
                            result.addAttentionPoint("EJB @MessageDriven transforme : " +
                                    classDecl.getNameAsString() + " → Controller REST async + EventListener Spring");
                            result.addConversion("MDB " + classDecl.getNameAsString() + " → REST async + @EventListener");
                            log.info("MDB detecte et transforme : {} → Controller REST async", classDecl.getNameAsString());
                        }
                        continue;
                    }

                    // G5 : Detecter le pattern EJB
                    UseCaseInfo.EjbPattern pattern = detectEjbPattern(classDecl, classIndex);

                    UseCaseInfo useCaseInfo;
                    if (pattern == UseCaseInfo.EjbPattern.BASE_USE_CASE) {
                        useCaseInfo = extractBaseUseCaseInfo(cu, classDecl, ejbType);
                    } else {
                        useCaseInfo = extractGenericServiceInfo(cu, classDecl, ejbType, pattern, classIndex);
                    }

                    if (useCaseInfo != null) {
                        // G10 : Collecter les annotations source
                        classDecl.getAnnotations().forEach(ann ->
                                useCaseInfo.getSourceAnnotations().add(ann.getNameAsString()));

                        // CUSTOM ANNOTATIONS : Detecter et classifier les annotations custom bancaires
                        if (annotationPropagator != null) {
                            List<String> annNames = new ArrayList<>();
                            List<String> annExprs = new ArrayList<>();
                            classDecl.getAnnotations().forEach(ann -> {
                                annNames.add(ann.getNameAsString());
                                annExprs.add(ann.toString());
                            });
                            String pkgHint = cu.getPackageDeclaration()
                                    .map(pd -> pd.getNameAsString()).orElse("");
                            List<DetectedAnnotation> classAnnotations = annotationPropagator
                                    .detectAndClassify(annNames, annExprs,
                                            useCaseInfo.getClassName(), true, pkgHint);
                            result.addCustomAnnotations(classAnnotations);

                            // Detecter aussi les annotations sur les methodes publiques
                            for (MethodDeclaration method : classDecl.getMethods()) {
                                if (method.isPublic()) {
                                    List<String> mAnnNames = new ArrayList<>();
                                    List<String> mAnnExprs = new ArrayList<>();
                                    method.getAnnotations().forEach(ann -> {
                                        mAnnNames.add(ann.getNameAsString());
                                        mAnnExprs.add(ann.toString());
                                    });
                                    List<DetectedAnnotation> methodAnnotations = annotationPropagator
                                            .detectAndClassify(mAnnNames, mAnnExprs,
                                                    useCaseInfo.getClassName(), false, pkgHint);
                                    methodAnnotations.forEach(da ->
                                            da.setSourceMethodName(method.getNameAsString()));
                                    result.addCustomAnnotations(methodAnnotations);
                                }
                            }
                        }

                        // G11 : Extraire la Javadoc
                        classDecl.getJavadocComment().ifPresent(jd ->
                                useCaseInfo.setJavadoc(jd.getContent().trim()));
                        useCaseInfo.setSwaggerSummary(generateSwaggerSummary(useCaseInfo.getClassName()));

                        // G14 : Detecter le base package
                        if (result.getSourceBasePackage() == null && !useCaseInfo.getPackageName().isEmpty()) {
                            String[] parts = useCaseInfo.getPackageName().split("\\.");
                            if (parts.length >= 3) {
                                result.setSourceBasePackage(parts[0] + "." + parts[1] + "." + parts[2]);
                            }
                        }

                        result.addUseCase(useCaseInfo);
                        log.info("EJB detecte : {} (type={}, pattern={}, httpMethod={}, httpStatus={})",
                                useCaseInfo.getClassName(), ejbType, pattern,
                                useCaseInfo.getHttpMethod(), useCaseInfo.getHttpStatusCode());

                        if (useCaseInfo.getInputDtoClassName() != null) {
                            dtoClassNames.add(useCaseInfo.getInputDtoClassName());
                        }
                        if (useCaseInfo.getOutputDtoClassName() != null) {
                            dtoClassNames.add(useCaseInfo.getOutputDtoClassName());
                        }
                    }
                    continue;
                }

                // Detecter les DTOs
                if (isDtoCandidate(classDecl.getNameAsString()) || isDtoByAnnotation(classDecl)) {
                    dtoClassNames.add(classDecl.getNameAsString());
                }
            }

            // Detecter les enums JAXB (@XmlEnum ou enums dans le package)
            for (EnumDeclaration enumDecl : cu.findAll(EnumDeclaration.class)) {
                String enumPkg = cu.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");
                List<String> values = new ArrayList<>();
                for (EnumConstantDeclaration constant : enumDecl.getEntries()) {
                    values.add(constant.getNameAsString());
                }
                String enumSource = enumDecl.toString();
                ProjectAnalysisResult.EnumInfo enumInfo = new ProjectAnalysisResult.EnumInfo(
                        enumDecl.getNameAsString(), enumPkg, values, enumSource);
                result.addEnum(enumInfo);
                log.info("Enum detecte : {} ({} valeurs)", enumDecl.getNameAsString(), values.size());
            }

            // Detecter les exceptions custom (extends Exception/RuntimeException/...Exception)
            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                String parentClass = classDecl.getExtendedTypes().stream()
                        .findFirst().map(t -> t.getNameAsString()).orElse("");
                if (parentClass.endsWith("Exception") || parentClass.equals("Throwable")) {
                    String excPkg = cu.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");
                    // Extraire un eventuel errorCode
                    String errorCode = null;
                    for (FieldDeclaration field : classDecl.getFields()) {
                        for (VariableDeclarator var : field.getVariables()) {
                            if (var.getNameAsString().toLowerCase().contains("code") ||
                                var.getNameAsString().toLowerCase().contains("error")) {
                                if (var.getInitializer().isPresent()) {
                                    errorCode = var.getInitializer().get().toString();
                                }
                            }
                        }
                    }
                    ProjectAnalysisResult.ExceptionInfo excInfo = new ProjectAnalysisResult.ExceptionInfo(
                            classDecl.getNameAsString(), excPkg, parentClass, errorCode,
                            classDecl.toString());
                    result.addException(excInfo);
                    log.info("Exception custom detectee : {} extends {}", classDecl.getNameAsString(), parentClass);
                }
            }

            // BUG B : Detecter les interfaces @Remote/@Local pour les recopier dans le projet genere
            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                if (classDecl.isInterface() && (hasAnnotation(classDecl, "Remote") || hasAnnotation(classDecl, "Local"))) {
                    String ifacePkg = cu.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");
                    // Capturer le CU complet (imports + interface)
                    String ifaceSource = cu.toString();
                    ProjectAnalysisResult.RemoteInterfaceInfo ifaceInfo = new ProjectAnalysisResult.RemoteInterfaceInfo(
                            classDecl.getNameAsString(), ifacePkg, ifaceSource);
                    result.addRemoteInterface(ifaceInfo);
                    log.info("Interface @Remote/@Local detectee : {}", classDecl.getNameAsString());
                }
            }

            // Detecter les validateurs custom (@Constraint annotation + ConstraintValidator impl)
            // Les annotations custom sont des AnnotationDeclaration (@interface), pas des ClassOrInterfaceDeclaration
            for (com.github.javaparser.ast.body.AnnotationDeclaration annotDecl : cu.findAll(com.github.javaparser.ast.body.AnnotationDeclaration.class)) {
                // Verifier si l'annotation a @Constraint
                boolean hasConstraint = annotDecl.getAnnotations().stream()
                        .anyMatch(a -> a.getNameAsString().equals("Constraint"));
                if (hasConstraint) {
                    String valPkg = cu.getPackageDeclaration().map(pd -> pd.getNameAsString()).orElse("");
                    String annotName = annotDecl.getNameAsString();
                    String validatorName = null;
                    String validatorSource = null;
                    // Chercher dans tous les CU un ConstraintValidator pour cette annotation
                    for (Map.Entry<String, CompilationUnit> cuEntry : compilationUnits.entrySet()) {
                        for (ClassOrInterfaceDeclaration candidate : cuEntry.getValue().findAll(ClassOrInterfaceDeclaration.class)) {
                            boolean implementsCV = candidate.getImplementedTypes().stream()
                                    .anyMatch(t -> t.getNameAsString().equals("ConstraintValidator"));
                            if (implementsCV && candidate.getImplementedTypes().stream()
                                    .anyMatch(t -> t.toString().contains(annotName))) {
                                validatorName = candidate.getNameAsString();
                                // Capturer le CU complet (imports + classe) pour le validateur
                                validatorSource = cuEntry.getValue().toString();
                            }
                        }
                    }
                    // Capturer le CU complet (imports + annotation) pour l'annotation
                    String annotFullSource = cu.toString();
                    ProjectAnalysisResult.ValidatorInfo valInfo = new ProjectAnalysisResult.ValidatorInfo(
                            annotName, validatorName, valPkg,
                            annotFullSource, validatorSource);
                    result.addValidator(valInfo);
                    log.info("Validateur custom detecte : @{} -> {}", annotName, validatorName);
                }
            }
        }

        // Phase 3 : Extraire les DTOs complets
        Map<String, DtoInfo> dtoMap = new LinkedHashMap<>();

        for (Map.Entry<String, CompilationUnit> entry : compilationUnits.entrySet()) {
            CompilationUnit cu = entry.getValue();

            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                String className = classDecl.getNameAsString();
                if (dtoClassNames.contains(className) || isDtoCandidate(className) || isDtoByAnnotation(classDecl)) {
                    DtoInfo dtoInfo = extractDtoInfo(cu, classDecl);
                    if (dtoInfo != null && !dtoMap.containsKey(dtoInfo.getFullyQualifiedName())) {
                        dtoMap.put(dtoInfo.getFullyQualifiedName(), dtoInfo);
                        if (dtoInfo.hasJaxbAnnotations()) {
                            result.setHasJaxbAnnotations(true);
                        }
                        log.info("DTO detecte : {} (JAXB: {})", dtoInfo.getClassName(), dtoInfo.hasJaxbAnnotations());
                    }
                }
            }
        }

        result.setDtos(new ArrayList<>(dtoMap.values()));

        // Phase 4 : Enrichir les UseCases avec les informations JAXB des DTO
        for (UseCaseInfo useCase : result.getUseCases()) {
            enrichUseCaseWithJaxbInfo(useCase, dtoMap);
        }

        // Phase 5 : Calculer les totaux pour G14
        result.setTotalEjbCount(result.getUseCases().size());
        long serviceCount = result.getUseCases().stream()
                .filter(uc -> uc.getEjbPattern() != UseCaseInfo.EjbPattern.BASE_USE_CASE)
                .count();
        result.setServiceCount((int) serviceCount);
        result.getUseCases().stream()
                .filter(uc -> uc.getEjbPattern() != UseCaseInfo.EjbPattern.BASE_USE_CASE)
                .forEach(uc -> result.getServiceNames().add(uc.getClassName()));

        // G14 : Conversions appliquees
        if (result.isHasLegacyJavaxImports()) {
            result.addConversion("javax.xml.bind.* → jakarta.xml.bind.*");
            result.addConversion("javax.ejb.* → supprime (remplace par Spring @Service)");
            result.addConversion("javax.persistence.* → jakarta.persistence.*");
            result.addConversion("javax.validation.* → jakarta.validation.*");
        }
        if (result.isHasJaxbAnnotations()) {
            result.addConversion("Annotations JAXB preservees + support Jackson XML");
        }

        // Phase BIAN : Resoudre le mapping BIAN pour chaque UseCase
        if (bianMappingResolver != null) {
            log.info("[BIAN] Resolution du mapping BIAN pour {} UseCases", result.getUseCases().size());
            for (UseCaseInfo uc : result.getUseCases()) {
                BianMapping bianMapping = bianMappingResolver.resolve(uc.getClassName());
                uc.setBianMapping(bianMapping);
                // Mettre a jour l'URL REST avec l'URL BIAN
                if (bianMapping.getUrl() != null) {
                    uc.setRestEndpoint(bianMapping.buildUrl("/api/v1"));
                }
                // Mettre a jour la methode HTTP
                if (bianMapping.getHttpMethod() != null) {
                    uc.setHttpMethod(bianMapping.getHttpMethod());
                    uc.setHttpStatusCode(bianMapping.getHttpStatus());
                }
                log.debug("[BIAN] {} → {} ({}) [{}]", uc.getClassName(),
                        bianMapping.getServiceDomain(), bianMapping.getAction(), bianMapping.getUrl());
            }
        }

        log.info("Analyse terminee. EJBs : {}, DTOs : {}, Entites JPA : {}",
                result.getUseCases().size(), result.getDtos().size(), result.getJpaEntityCount());
        return result;
    }

    // ==================== G4 : EJB TYPE DETECTION ====================

    private UseCaseInfo.EjbType detectEjbType(ClassOrInterfaceDeclaration cls) {
        if (hasAnnotation(cls, "Stateless")) return UseCaseInfo.EjbType.STATELESS;
        if (hasAnnotation(cls, "Stateful")) return UseCaseInfo.EjbType.STATEFUL;
        if (hasAnnotation(cls, "Singleton")) return UseCaseInfo.EjbType.SINGLETON;
        if (hasAnnotation(cls, "MessageDriven")) return UseCaseInfo.EjbType.MESSAGE_DRIVEN;

        // BOA/EAI : @UseCase est l'equivalent de @Stateless dans le framework interne
        if (hasAnnotation(cls, "UseCase")) return UseCaseInfo.EjbType.USE_CASE_CUSTOM;

        // Spring : @Service sur une classe qui implemente BaseUseCase ou a execute()
        if (hasAnnotation(cls, "Service")) {
            boolean implementsBaseUseCase = cls.getImplementedTypes().stream()
                    .anyMatch(t -> t.getNameAsString().equals(BASE_USE_CASE_INTERFACE));
            boolean hasExecute = cls.getMethods().stream()
                    .anyMatch(m -> m.getNameAsString().equals(EXECUTE_METHOD_NAME));
            if (implementsBaseUseCase || hasExecute) {
                return UseCaseInfo.EjbType.USE_CASE_CUSTOM;
            }
            // Spring Legacy : @Service + @Transactional sans BaseUseCase
            if (hasAnnotation(cls, "Transactional")) {
                return UseCaseInfo.EjbType.SPRING_LEGACY;
            }
        }

        // Spring Legacy : @Component + @Transactional
        if (hasAnnotation(cls, "Component") && hasAnnotation(cls, "Transactional")) {
            return UseCaseInfo.EjbType.SPRING_LEGACY;
        }

        return null;
    }

    // ==================== G5 : EJB PATTERN DETECTION ====================

    private UseCaseInfo.EjbPattern detectEjbPattern(ClassOrInterfaceDeclaration cls,
                                                     Map<String, ClassOrInterfaceDeclaration> classIndex) {
        // Pattern 1 : BaseUseCase avec execute()
        boolean implementsBaseUseCase = cls.getImplementedTypes().stream()
                .anyMatch(t -> t.getNameAsString().equals(BASE_USE_CASE_INTERFACE));
        boolean hasExecute = cls.getMethods().stream()
                .anyMatch(m -> m.getNameAsString().equals(EXECUTE_METHOD_NAME));
        if (implementsBaseUseCase || hasExecute) {
            return UseCaseInfo.EjbPattern.BASE_USE_CASE;
        }

        // Pattern 2 : Remote/Local Interface
        for (ClassOrInterfaceType iface : cls.getImplementedTypes()) {
            String ifaceName = iface.getNameAsString();
            for (ClassOrInterfaceDeclaration candidate : classIndex.values()) {
                if (candidate.getNameAsString().equals(ifaceName) && candidate.isInterface()) {
                    if (hasAnnotation(candidate, "Remote")) {
                        return UseCaseInfo.EjbPattern.REMOTE_INTERFACE;
                    }
                    if (hasAnnotation(candidate, "Local")) {
                        return UseCaseInfo.EjbPattern.LOCAL_INTERFACE;
                    }
                }
            }
        }

        // Pattern 3 : DAO/Repository (3+ methodes CRUD)
        long crudCount = cls.getMethods().stream()
                .filter(MethodDeclaration::isPublic)
                .filter(m -> {
                    String name = m.getNameAsString().toLowerCase();
                    return name.startsWith("find") || name.startsWith("create") ||
                           name.startsWith("update") || name.startsWith("delete") ||
                           name.startsWith("save") || name.startsWith("list") ||
                           name.startsWith("get") || name.startsWith("remove");
                })
                .count();
        if (crudCount >= 3) {
            return UseCaseInfo.EjbPattern.DAO_REPOSITORY;
        }

        // Pattern 4 : Service generique
        return UseCaseInfo.EjbPattern.GENERIC_SERVICE;
    }

    // ==================== BASE USE CASE EXTRACTION ====================

    private UseCaseInfo extractBaseUseCaseInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl,
                                               UseCaseInfo.EjbType ejbType) {
        UseCaseInfo info = new UseCaseInfo();
        info.setClassName(classDecl.getNameAsString());
        info.setEjbType(ejbType);
        info.setEjbPattern(UseCaseInfo.EjbPattern.BASE_USE_CASE);

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString()).orElse("");
        info.setPackageName(packageName);
        info.setFullyQualifiedName(packageName.isEmpty() ? info.getClassName() : packageName + "." + info.getClassName());

        info.setStateless(ejbType == UseCaseInfo.EjbType.STATELESS);

        // Interfaces implementees
        classDecl.getImplementedTypes().forEach(t -> info.getImplementedInterfaces().add(t.getNameAsString()));
        classDecl.getImplementedTypes().stream().findFirst()
                .ifPresent(t -> info.setImplementedInterface(t.getNameAsString()));

        // Methode execute
        Optional<MethodDeclaration> executeMethod = classDecl.getMethods().stream()
                .filter(m -> m.getNameAsString().equals(EXECUTE_METHOD_NAME))
                .findFirst();

        if (executeMethod.isPresent()) {
            info.setHasExecuteMethod(true);
            MethodDeclaration method = executeMethod.get();

            String inputDto = detectInputDto(method);
            if (inputDto != null) info.setInputDtoClassName(inputDto);

            String outputDto = detectOutputDto(method);
            if (outputDto != null) info.setOutputDtoClassName(outputDto);

            if (info.getInputDtoClassName() == null) {
                info.setInputDtoClassName(deriveInputDtoName(info.getClassName()));
            }
            if (info.getOutputDtoClassName() == null) {
                info.setOutputDtoClassName(deriveOutputDtoName(info.getClassName()));
            }
        }

        // G6 : Determiner le code HTTP pour BaseUseCase
        String className = info.getClassName();
        if (containsAny(className, CREATION_KEYWORDS)) {
            info.setHttpMethod("POST");
            info.setHttpStatusCode(201);
        } else if (containsAny(className, DELETION_KEYWORDS)) {
            info.setHttpMethod("DELETE");
            info.setHttpStatusCode(204);
        } else if (containsAny(className, CONSULTATION_KEYWORDS)) {
            info.setHttpMethod("POST"); // POST car on envoie un VoIn
            info.setHttpStatusCode(200);
        } else if (containsAny(className, UPDATE_KEYWORDS)) {
            info.setHttpMethod("PUT");
            info.setHttpStatusCode(200);
        } else {
            info.setHttpMethod("POST");
            info.setHttpStatusCode(200);
        }

        // Noms generes
        String baseName = deriveBaseName(info.getClassName());
        info.setRestEndpoint("/api/" + toKebabCase(baseName));
        info.setControllerName(baseName + "Controller");
        info.setServiceAdapterName(baseName + "ServiceAdapter");
        info.setJndiName(getJndiPrefix() + info.getClassName());

        return info;
    }

    // ==================== G5 : GENERIC SERVICE EXTRACTION ====================

    private UseCaseInfo extractGenericServiceInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl,
                                                   UseCaseInfo.EjbType ejbType, UseCaseInfo.EjbPattern pattern,
                                                   Map<String, ClassOrInterfaceDeclaration> classIndex) {
        UseCaseInfo info = new UseCaseInfo();
        info.setClassName(classDecl.getNameAsString());
        info.setEjbType(ejbType);
        info.setEjbPattern(pattern);
        info.setHasExecuteMethod(false);

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString()).orElse("");
        info.setPackageName(packageName);
        info.setFullyQualifiedName(packageName.isEmpty() ? info.getClassName() : packageName + "." + info.getClassName());

        info.setStateless(ejbType == UseCaseInfo.EjbType.STATELESS);

        // Interfaces implementees
        classDecl.getImplementedTypes().forEach(t -> info.getImplementedInterfaces().add(t.getNameAsString()));
        classDecl.getImplementedTypes().stream().findFirst()
                .ifPresent(t -> info.setImplementedInterface(t.getNameAsString()));

        // G5 : Collecter toutes les methodes publiques
        List<MethodDeclaration> publicMethods = classDecl.getMethods().stream()
                .filter(MethodDeclaration::isPublic)
                .filter(m -> !isObjectMethod(m.getNameAsString()))
                .collect(Collectors.toList());

        for (MethodDeclaration method : publicMethods) {
            UseCaseInfo.MethodInfo mi = new UseCaseInfo.MethodInfo();
            mi.setName(method.getNameAsString());
            mi.setReturnType(method.getTypeAsString());

            // G11 : Javadoc de la methode
            method.getJavadocComment().ifPresent(jd -> mi.setJavadoc(jd.getContent().trim()));

            // G8 : Parametres
            for (Parameter param : method.getParameters()) {
                UseCaseInfo.ParameterInfo pi = new UseCaseInfo.ParameterInfo(
                        param.getNameAsString(), param.getTypeAsString());
                mi.getParameters().add(pi);
            }

            // G6 : Determiner la methode HTTP
            String[] httpInfo = resolveHttpMethod(method.getNameAsString());
            mi.setHttpMethod(httpInfo[0]);
            mi.setHttpStatusCode(Integer.parseInt(httpInfo[1]));

            // G12 : Generer le sous-path REST
            mi.setRestPath(generateMethodRestPath(method.getNameAsString(), mi.getParameters()));

            // AXE 4.2 : Extraire @RolesAllowed sur la methode
            extractRolesAllowed(method, mi.getRolesAllowed());

            // AXE 1.6 : Extraire les exceptions throws
            method.getThrownExceptions().forEach(te -> mi.getThrowsExceptions().add(te.asString()));

            info.getPublicMethods().add(mi);
        }

        // AXE 4.2 : Extraire @RolesAllowed au niveau de la classe
        extractRolesAllowed(classDecl, info.getRolesAllowed());

        // AXE 3 : Detecter le nom de l'interface @Remote implementee
        for (ClassOrInterfaceType iface : classDecl.getImplementedTypes()) {
            String ifaceName = iface.getNameAsString();
            for (ClassOrInterfaceDeclaration candidate : classIndex.values()) {
                if (candidate.getNameAsString().equals(ifaceName) && candidate.isInterface()
                        && hasAnnotation(candidate, "Remote")) {
                    info.setRemoteInterfaceName(ifaceName);
                }
            }
        }

        // Pour les services generiques, pas de DTO unique
        info.setInputDtoClassName(null);
        info.setOutputDtoClassName(null);

        // HTTP method principal = POST par defaut
        info.setHttpMethod("POST");
        info.setHttpStatusCode(200);

        // Noms generes
        String baseName = deriveBaseName(info.getClassName());
        info.setRestEndpoint("/api/" + toKebabCase(baseName));
        info.setControllerName(baseName + "Controller");
        info.setServiceAdapterName(baseName + "ServiceAdapter");
        info.setJndiName(getJndiPrefix() + info.getClassName());

        return info;
    }

    // ==================== MDB EXTRACTION ====================

    /**
     * Extrait les informations d'un Message-Driven Bean pour le transformer
     * en composant event-driven Spring (Controller REST async + EventListener).
     */
    private UseCaseInfo extractMdbInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl) {
        UseCaseInfo info = new UseCaseInfo();
        info.setClassName(classDecl.getNameAsString());
        info.setEjbType(UseCaseInfo.EjbType.MESSAGE_DRIVEN);
        info.setEjbPattern(UseCaseInfo.EjbPattern.GENERIC_SERVICE);
        info.setHasExecuteMethod(false);
        info.setStateless(true);

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString()).orElse("");
        info.setPackageName(packageName);
        info.setFullyQualifiedName(packageName.isEmpty() ? info.getClassName() : packageName + "." + info.getClassName());

        // Interfaces implementees
        classDecl.getImplementedTypes().forEach(t -> info.getImplementedInterfaces().add(t.getNameAsString()));
        classDecl.getImplementedTypes().stream().findFirst()
                .ifPresent(t -> info.setImplementedInterface(t.getNameAsString()));

        // Extraire les methodes publiques (notamment onMessage)
        List<MethodDeclaration> publicMethods = classDecl.getMethods().stream()
                .filter(MethodDeclaration::isPublic)
                .filter(m -> !isObjectMethod(m.getNameAsString()))
                .collect(Collectors.toList());

        for (MethodDeclaration method : publicMethods) {
            UseCaseInfo.MethodInfo mi = new UseCaseInfo.MethodInfo();
            mi.setName(method.getNameAsString());
            mi.setReturnType(method.getTypeAsString());
            method.getJavadocComment().ifPresent(jd -> mi.setJavadoc(jd.getContent().trim()));

            for (Parameter param : method.getParameters()) {
                UseCaseInfo.ParameterInfo pi = new UseCaseInfo.ParameterInfo(
                        param.getNameAsString(), param.getTypeAsString());
                mi.getParameters().add(pi);
            }

            mi.setHttpMethod("POST");
            mi.setHttpStatusCode(202);  // 202 Accepted pour les operations async
            mi.setRestPath(generateMethodRestPath(method.getNameAsString(), mi.getParameters()));
            info.getPublicMethods().add(mi);
        }

        // Extraire la destination JMS depuis @ActivationConfigProperty si present
        String jmsDestination = extractJmsDestination(classDecl);

        // Noms generes
        String baseName = deriveBaseName(info.getClassName());
        info.setRestEndpoint("/api/events/" + toKebabCase(baseName));
        info.setControllerName(baseName + "Controller");
        info.setServiceAdapterName(baseName + "ServiceAdapter");
        info.setJndiName(jmsDestination != null ? jmsDestination : "jms/queue/" + baseName);

        info.setHttpMethod("POST");
        info.setHttpStatusCode(202);  // 202 Accepted

        return info;
    }

    /**
     * Extrait la destination JMS depuis les @ActivationConfigProperty du MDB.
     */
    private String extractJmsDestination(ClassOrInterfaceDeclaration classDecl) {
        for (AnnotationExpr ann : classDecl.getAnnotations()) {
            if (ann.getNameAsString().equals("MessageDriven") && ann.isNormalAnnotationExpr()) {
                for (var pair : ann.asNormalAnnotationExpr().getPairs()) {
                    if (pair.getNameAsString().equals("activationConfig")) {
                        String value = pair.getValue().toString();
                        // Chercher destination dans les ActivationConfigProperty
                        java.util.regex.Matcher matcher = java.util.regex.Pattern
                                .compile("propertyValue\\s*=\\s*\"([^\"]+)\"")
                                .matcher(value);
                        while (matcher.find()) {
                            String propValue = matcher.group(1);
                            if (propValue.contains("queue") || propValue.contains("topic")
                                    || propValue.contains("jms") || propValue.contains("Queue")
                                    || propValue.contains("Topic")) {
                                return propValue;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    // ==================== DTO EXTRACTION ====================

    private DtoInfo extractDtoInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl) {
        DtoInfo dto = new DtoInfo();
        dto.setClassName(classDecl.getNameAsString());

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString()).orElse("");
        dto.setPackageName(packageName);
        dto.setFullyQualifiedName(packageName.isEmpty() ? dto.getClassName() : packageName + "." + dto.getClassName());

        // Detecter les annotations JAXB au niveau de la classe
        List<String> jaxbAnnotationsList = new ArrayList<>();
        for (AnnotationExpr annotation : classDecl.getAnnotations()) {
            String annotName = annotation.getNameAsString();

            if (annotName.equals("XmlRootElement")) {
                dto.setHasXmlRootElement(true);
                jaxbAnnotationsList.add("@XmlRootElement");
                extractAnnotationStringAttribute(annotation, "name")
                        .ifPresent(dto::setXmlRootElementName);
            }
            if (annotName.equals("XmlType")) {
                dto.setHasXmlType(true);
                jaxbAnnotationsList.add("@XmlType");
            }
            if (annotName.equals("XmlAccessorType")) {
                dto.setHasXmlAccessorType(true);
                jaxbAnnotationsList.add("@XmlAccessorType");
                extractAnnotationValue(annotation).ifPresent(dto::setXmlAccessorTypeValue);
            }
            if (JAXB_CLASS_ANNOTATIONS.contains(annotName)) {
                if (!jaxbAnnotationsList.contains("@" + annotName)) {
                    jaxbAnnotationsList.add("@" + annotName);
                }
            }
        }
        dto.setJaxbAnnotations(jaxbAnnotationsList);

        // Extraire les champs avec detection des annotations JAXB, static/final, required
        for (FieldDeclaration field : classDecl.getFields()) {
            for (VariableDeclarator var : field.getVariables()) {
                String accessMod = field.getAccessSpecifier().asString();
                DtoInfo.FieldInfo fieldInfo = new DtoInfo.FieldInfo(
                        var.getNameAsString(), var.getTypeAsString(), accessMod);

                // BUG 1 : Detecter static et final
                boolean isStatic = field.getModifiers().stream()
                        .anyMatch(m -> m.getKeyword() == Modifier.Keyword.STATIC);
                boolean isFinal = field.getModifiers().stream()
                        .anyMatch(m -> m.getKeyword() == Modifier.Keyword.FINAL);
                fieldInfo.setStatic(isStatic);
                fieldInfo.setFinal(isFinal);

                // Detecter les annotations JAXB sur les champs
                for (AnnotationExpr fieldAnnot : field.getAnnotations()) {
                    String fieldAnnotName = fieldAnnot.getNameAsString();

                    if (fieldAnnotName.equals("XmlElement")) {
                        fieldInfo.setHasXmlElement(true);
                        extractAnnotationStringAttribute(fieldAnnot, "name")
                                .ifPresent(fieldInfo::setXmlName);
                        extractAnnotationBooleanAttribute(fieldAnnot, "required")
                                .ifPresent(fieldInfo::setRequired);
                    }
                    if (fieldAnnotName.equals("XmlAttribute")) {
                        fieldInfo.setHasXmlAttribute(true);
                        extractAnnotationStringAttribute(fieldAnnot, "name")
                                .ifPresent(fieldInfo::setXmlName);
                        extractAnnotationBooleanAttribute(fieldAnnot, "required")
                                .ifPresent(fieldInfo::setRequired);
                    }
                    if (fieldAnnotName.equals("XmlTransient")) {
                        fieldInfo.setHasXmlTransient(true);
                    }
                    if (fieldAnnotName.equals("XmlElementWrapper")) {
                        fieldInfo.setHasXmlElementWrapper(true);
                        extractAnnotationStringAttribute(fieldAnnot, "name")
                                .ifPresent(fieldInfo::setXmlElementWrapperName);
                    }
                    // Detecter @NotNull, @NotBlank, @NotEmpty
                    if ("NotNull".equals(fieldAnnotName) || "NotBlank".equals(fieldAnnotName) ||
                        "NotEmpty".equals(fieldAnnotName)) {
                        fieldInfo.setRequired(true);
                    }

                    // BUG H : Detecter les annotations custom de validation (@ValidIBAN, @ValidRIB, etc.)
                    if (fieldAnnotName.startsWith("Valid") && !fieldAnnotName.equals("Valid")
                            && Character.isUpperCase(fieldAnnotName.charAt(5))) {
                        fieldInfo.getCustomAnnotations().add(fieldAnnotName);
                    }
                }

                dto.getFields().add(fieldInfo);
            }
        }

        // Classe parente
        classDecl.getExtendedTypes().stream().findFirst()
                .ifPresent(t -> dto.setParentClassName(t.getNameAsString()));

        // Code source
        dto.setSourceCode(classDecl.toString());

        return dto;
    }

    // ==================== ENRICHMENT ====================

    private void enrichUseCaseWithJaxbInfo(UseCaseInfo useCase, Map<String, DtoInfo> dtoMap) {
        boolean inputHasJaxb = false;
        boolean outputHasJaxb = false;

        for (DtoInfo dto : dtoMap.values()) {
            if (dto.getClassName().equals(useCase.getInputDtoClassName())) {
                inputHasJaxb = dto.hasJaxbAnnotations();
                useCase.setInputDtoHasJaxb(inputHasJaxb);
                useCase.setInputDtoPackage(dto.getPackageName());
                boolean hasRequired = dto.getFields().stream().anyMatch(DtoInfo.FieldInfo::isRequired);
                useCase.setInputDtoHasRequiredFields(hasRequired);
            }
            if (dto.getClassName().equals(useCase.getOutputDtoClassName())) {
                outputHasJaxb = dto.hasJaxbAnnotations();
                useCase.setOutputDtoHasJaxb(outputHasJaxb);
                useCase.setOutputDtoPackage(dto.getPackageName());
            }
        }

        if (inputHasJaxb || outputHasJaxb) {
            useCase.setSerializationFormat(SerializationFormat.BOTH);
        } else {
            useCase.setSerializationFormat(SerializationFormat.JSON);
        }
    }

    // ==================== G6 : HTTP METHOD RESOLUTION ====================

    private String[] resolveHttpMethod(String methodName) {
        String lower = methodName.toLowerCase();
        for (Map.Entry<String, String[]> entry : HTTP_METHOD_PATTERNS.entrySet()) {
            if (lower.startsWith(entry.getKey())) {
                return entry.getValue();
            }
        }
        return new String[]{"POST", "200"};
    }

    // ==================== G11 : SWAGGER SUMMARY ====================

    private String generateSwaggerSummary(String className) {
        String baseName = deriveBaseName(className);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < baseName.length(); i++) {
            char c = baseName.charAt(i);
            if (i > 0 && Character.isUpperCase(c)) {
                sb.append(' ');
            }
            sb.append(i == 0 ? Character.toUpperCase(c) : Character.toLowerCase(c));
        }
        return sb.toString();
    }

    // ==================== G12 : REST PATH GENERATION ====================

    private String generateMethodRestPath(String methodName, List<UseCaseInfo.ParameterInfo> params) {
        StringBuilder path = new StringBuilder();
        for (UseCaseInfo.ParameterInfo param : params) {
            if (param.isIdParam()) {
                path.append("/{").append(param.getName()).append("}");
            }
        }
        return path.toString();
    }

    // ==================== G14 : PROJECT METADATA ====================

    private void detectProjectMetadata(Path projectRoot, ProjectAnalysisResult result) {
        Path pomPath = projectRoot.resolve("pom.xml");
        if (Files.exists(pomPath)) {
            try {
                String pomContent = Files.readString(pomPath);

                // Extraire l'artifactId du projet
                int start = pomContent.indexOf("<artifactId>");
                int end = pomContent.indexOf("</artifactId>");
                if (start >= 0 && end > start) {
                    result.setSourceProjectName(pomContent.substring(start + 12, end).trim());
                }

                // BOA/EAI : Extraire le parent POM s'il existe
                int parentStart = pomContent.indexOf("<parent>");
                int parentEnd = pomContent.indexOf("</parent>");
                if (parentStart >= 0 && parentEnd > parentStart) {
                    String parentBlock = pomContent.substring(parentStart, parentEnd + 9);
                    String parentGroupId = extractXmlTag(parentBlock, "groupId");
                    String parentArtifactId = extractXmlTag(parentBlock, "artifactId");
                    String parentVersion = extractXmlTag(parentBlock, "version");

                    if (parentGroupId != null && parentArtifactId != null) {
                        result.setParentPomGroupId(parentGroupId);
                        result.setParentPomArtifactId(parentArtifactId);
                        result.setParentPomVersion(parentVersion);

                        // Detecter si c'est un parent POM framework EAI
                        boolean isFrameworkParent = FRAMEWORK_PACKAGE_PREFIXES.stream()
                                .anyMatch(prefix -> parentGroupId.startsWith(prefix.replace(".", "").isEmpty() ? prefix : prefix.substring(0, prefix.length() - 1)));
                        for (String prefix : FRAMEWORK_PACKAGE_PREFIXES) {
                            String cleanPrefix = prefix.endsWith(".") ? prefix.substring(0, prefix.length() - 1) : prefix;
                            if (parentGroupId.startsWith(cleanPrefix)) {
                                result.setHasFrameworkParentPom(true);
                                log.info("[BOA/EAI] Parent POM framework detecte : {}:{}:{}",
                                        parentGroupId, parentArtifactId, parentVersion);
                                break;
                            }
                        }
                    }
                }

                // BOA/EAI : Extraire les dependances framework du pom.xml
                Pattern depPattern = Pattern.compile(
                        "<dependency>\\s*<groupId>([^<]+)</groupId>\\s*<artifactId>([^<]+)</artifactId>\\s*<version>([^<]*)</version>",
                        Pattern.DOTALL);
                Matcher depMatcher = depPattern.matcher(pomContent);
                while (depMatcher.find()) {
                    String groupId = depMatcher.group(1).trim();
                    String artifactId = depMatcher.group(2).trim();
                    String version = depMatcher.group(3).trim();
                    for (String prefix : FRAMEWORK_PACKAGE_PREFIXES) {
                        String cleanPrefix = prefix.endsWith(".") ? prefix.substring(0, prefix.length() - 1) : prefix;
                        if (groupId.startsWith(cleanPrefix)) {
                            result.addFrameworkDependency(groupId, artifactId, version);
                            log.info("[BOA/EAI] Dependance framework detectee : {}:{}", groupId, artifactId);
                            break;
                        }
                    }
                }

                // Extraire la version Java
                String javaVersion = extractXmlTag(pomContent, "java.version");
                if (javaVersion != null) {
                    result.setSourceJavaVersion(javaVersion);
                }

            } catch (IOException e) {
                log.warn("Impossible de lire le pom.xml : {}", e.getMessage());
            }
        }
        if (result.getSourceProjectName() == null) {
            result.setSourceProjectName(projectRoot.getFileName().toString());
        }
    }

    /** Utilitaire pour extraire la valeur d'un tag XML simple */
    private String extractXmlTag(String xml, String tagName) {
        String openTag = "<" + tagName + ">";
        String closeTag = "</" + tagName + ">";
        int start = xml.indexOf(openTag);
        int end = xml.indexOf(closeTag);
        if (start >= 0 && end > start) {
            return xml.substring(start + openTag.length(), end).trim();
        }
        return null;
    }

    /** BOA/EAI : Verifier si un type est un type framework (resolu par Maven, pas a recopier) */
    public boolean isFrameworkType(String typeName) {
        return FRAMEWORK_TYPES.contains(typeName);
    }

    /** BOA/EAI : Verifier si un import est un import framework */
    public boolean isFrameworkImport(String importName) {
        for (String prefix : FRAMEWORK_PACKAGE_PREFIXES) {
            if (importName.startsWith(prefix)) return true;
        }
        return false;
    }

    // ==================== DTO DETECTION HELPERS ====================

    private String detectInputDto(MethodDeclaration method) {
        List<CastExpr> casts = method.findAll(CastExpr.class);
        for (CastExpr cast : casts) {
            String typeName = cast.getType().asString();
            if (typeName.endsWith("VoIn") || typeName.endsWith("VOIn") ||
                typeName.endsWith("Input") || typeName.endsWith("Request")) {
                return typeName;
            }
        }
        List<VariableDeclarator> variables = method.findAll(VariableDeclarator.class);
        for (VariableDeclarator var : variables) {
            String typeName = var.getTypeAsString();
            if (typeName.endsWith("VoIn") || typeName.endsWith("VOIn") ||
                typeName.endsWith("Input") || typeName.endsWith("Request")) {
                return typeName;
            }
        }
        return null;
    }

    private String detectOutputDto(MethodDeclaration method) {
        List<VariableDeclarator> variables = method.findAll(VariableDeclarator.class);
        for (VariableDeclarator var : variables) {
            String typeName = var.getTypeAsString();
            if (typeName.endsWith("VoOut") || typeName.endsWith("VOOut") ||
                typeName.endsWith("Output") || typeName.endsWith("Response")) {
                return typeName;
            }
        }
        List<CastExpr> casts = method.findAll(CastExpr.class);
        for (CastExpr cast : casts) {
            String typeName = cast.getType().asString();
            if (typeName.endsWith("VoOut") || typeName.endsWith("VOOut") ||
                typeName.endsWith("Output") || typeName.endsWith("Response")) {
                return typeName;
            }
        }
        List<ReturnStmt> returns = method.findAll(ReturnStmt.class);
        for (ReturnStmt ret : returns) {
            if (ret.getExpression().isPresent()) {
                String expr = ret.getExpression().get().toString();
                Pattern pattern = Pattern.compile("\\(([A-Z][a-zA-Z]*(?:VoOut|VOOut|Output|Response))\\)");
                Matcher matcher = pattern.matcher(expr);
                if (matcher.find()) return matcher.group(1);
            }
        }
        return null;
    }

    // ==================== UTILITY METHODS ====================

    private boolean isDtoCandidate(String className) {
        return className.endsWith("VoIn") || className.endsWith("VoOut") ||
               className.endsWith("VOIn") || className.endsWith("VOOut") ||
               className.endsWith("Vo") || className.endsWith("VO") ||
               className.endsWith("Dto") || className.endsWith("DTO") ||
               className.endsWith("Input") || className.endsWith("Output") ||
               className.endsWith("Request") || className.endsWith("Response") ||
               className.endsWith("Bean");
    }

    private boolean isDtoByAnnotation(ClassOrInterfaceDeclaration cls) {
        return hasAnnotation(cls, "XmlRootElement") || hasAnnotation(cls, "XmlType");
    }

    private boolean hasAnnotation(ClassOrInterfaceDeclaration cls, String annotationName) {
        return cls.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    private boolean hasAnnotation(MethodDeclaration method, String annotationName) {
        return method.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals(annotationName));
    }

    /**
     * AXE 4.2 : Extraire les roles @RolesAllowed d'un noeud annote (classe ou methode).
     * Supporte @RolesAllowed("ADMIN"), @RolesAllowed({"ADMIN", "MANAGER"}).
     */
    @SuppressWarnings("unchecked")
    private void extractRolesAllowed(com.github.javaparser.ast.nodeTypes.NodeWithAnnotations<?> node, List<String> rolesTarget) {
        node.getAnnotations().forEach(ann -> {
            if (ann.getNameAsString().equals("RolesAllowed")) {
                if (ann instanceof SingleMemberAnnotationExpr singleAnnot) {
                    Expression value = singleAnnot.getMemberValue();
                    if (value instanceof StringLiteralExpr strExpr) {
                        rolesTarget.add(strExpr.getValue());
                    } else if (value instanceof ArrayInitializerExpr arrayExpr) {
                        arrayExpr.getValues().forEach(v -> {
                            if (v instanceof StringLiteralExpr s) rolesTarget.add(s.getValue());
                        });
                    }
                } else if (ann instanceof NormalAnnotationExpr normalAnnot) {
                    normalAnnot.getPairs().forEach(pair -> {
                        if (pair.getNameAsString().equals("value")) {
                            Expression value = pair.getValue();
                            if (value instanceof StringLiteralExpr strExpr) {
                                rolesTarget.add(strExpr.getValue());
                            } else if (value instanceof ArrayInitializerExpr arrayExpr) {
                                arrayExpr.getValues().forEach(v -> {
                                    if (v instanceof StringLiteralExpr s) rolesTarget.add(s.getValue());
                                });
                            }
                        }
                    });
                }
            }
        });
    }

    private boolean isObjectMethod(String name) {
        return "toString".equals(name) || "hashCode".equals(name) || "equals".equals(name) ||
               "clone".equals(name) || "finalize".equals(name) || "getClass".equals(name);
    }

    private String deriveBaseName(String className) {
        String[] suffixes = {"UC", "UseCase", "Bean", "Impl", "EJB", "ServiceBean", "Service", "MDB"};
        // Trier par longueur decroissante pour matcher les plus longs d'abord
        Arrays.sort(suffixes, (a, b) -> b.length() - a.length());
        String base = className;
        for (String suffix : suffixes) {
            if (className.endsWith(suffix) && className.length() > suffix.length()) {
                base = className.substring(0, className.length() - suffix.length());
                break;
            }
        }
        // Modification 7 : Garantir PascalCase (premiere lettre majuscule)
        return ensurePascalCase(base);
    }

    /**
     * BOA/EAI Modification 7 : Garantir que le nom est en PascalCase.
     * Si le nom est tout en minuscules (ex: "activationcartebmcedirect"), essayer de le decouper.
     * Sinon, juste s'assurer que la premiere lettre est en majuscule.
     */
    private String ensurePascalCase(String name) {
        if (name == null || name.isEmpty()) return name;

        // Si deja en PascalCase (contient des majuscules apres le premier caractere), OK
        boolean hasMixedCase = false;
        for (int i = 1; i < name.length(); i++) {
            if (Character.isUpperCase(name.charAt(i))) {
                hasMixedCase = true;
                break;
            }
        }
        if (hasMixedCase) {
            // Deja en PascalCase ou CamelCase, juste s'assurer de la premiere lettre
            return Character.toUpperCase(name.charAt(0)) + name.substring(1);
        }

        // Tout en minuscules : essayer de decouper sur des patterns connus
        // Ex: "activationcartebmcedirect" → "ActivationCarteBmceDirect"
        String lower = name.toLowerCase();
        String[] knownWords = {
            "activation", "carte", "bmce", "direct", "charger", "client", "data",
            "receptionner", "virement", "solde", "compte", "agence", "poste",
            "ebanking", "souscription", "consultation", "transfert", "operation",
            "authentification", "validation", "annulation", "creation", "modification",
            "suppression", "recherche", "liste", "detail", "historique", "service",
            "magix", "rma", "cmi", "hps", "asal", "tsi", "ged", "otp"
        };

        StringBuilder result = new StringBuilder();
        int pos = 0;
        while (pos < lower.length()) {
            boolean found = false;
            // Essayer les mots les plus longs d'abord
            for (String word : knownWords) {
                if (lower.startsWith(word, pos)) {
                    result.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
                    pos += word.length();
                    found = true;
                    break;
                }
            }
            if (!found) {
                result.append(pos == 0 || result.length() == 0 ?
                        Character.toUpperCase(lower.charAt(pos)) : lower.charAt(pos));
                pos++;
            }
        }
        return result.toString();
    }

    private String deriveInputDtoName(String className) {
        return deriveBaseName(className) + "VoIn";
    }

    private String deriveOutputDtoName(String className) {
        return deriveBaseName(className) + "VoOut";
    }

    private String toKebabCase(String camelCase) {
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    private String getFullyQualifiedName(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl) {
        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString()).orElse("");
        return packageName.isEmpty() ? classDecl.getNameAsString() : packageName + "." + classDecl.getNameAsString();
    }

    private boolean containsAny(String text, String[] keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) return true;
        }
        return false;
    }

    private Optional<String> extractAnnotationStringAttribute(AnnotationExpr annotation, String attrName) {
        if (annotation instanceof NormalAnnotationExpr normalAnnot) {
            for (MemberValuePair pair : normalAnnot.getPairs()) {
                if (pair.getNameAsString().equals(attrName) && pair.getValue() instanceof StringLiteralExpr strExpr) {
                    return Optional.of(strExpr.getValue());
                }
            }
        }
        if (annotation instanceof SingleMemberAnnotationExpr singleAnnot) {
            if (singleAnnot.getMemberValue() instanceof StringLiteralExpr strExpr) {
                return Optional.of(strExpr.getValue());
            }
        }
        return Optional.empty();
    }

    private Optional<Boolean> extractAnnotationBooleanAttribute(AnnotationExpr annotation, String attrName) {
        if (annotation instanceof NormalAnnotationExpr normalAnnot) {
            for (MemberValuePair pair : normalAnnot.getPairs()) {
                if (pair.getNameAsString().equals(attrName) && pair.getValue() instanceof BooleanLiteralExpr boolExpr) {
                    return Optional.of(boolExpr.getValue());
                }
            }
        }
        return Optional.empty();
    }

    private Optional<String> extractAnnotationValue(AnnotationExpr annotation) {
        if (annotation instanceof SingleMemberAnnotationExpr singleAnnot) {
            return Optional.of(singleAnnot.getMemberValue().toString());
        }
        if (annotation instanceof NormalAnnotationExpr normalAnnot) {
            for (MemberValuePair pair : normalAnnot.getPairs()) {
                if (pair.getNameAsString().equals("value")) {
                    return Optional.of(pair.getValue().toString());
                }
            }
        }
        return Optional.empty();
    }

    private List<Path> findJavaFiles(Path rootPath) {
        List<Path> javaFiles = new ArrayList<>();
        try {
            Files.walkFileTree(rootPath, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (file.toString().endsWith(".java")) {
                        javaFiles.add(file);
                    }
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    log.warn("Impossible de lire le fichier : {}", file);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.error("Erreur lors du parcours du repertoire : {}", rootPath, e);
        }
        return javaFiles;
    }

    private String getJndiPrefix() {
        return "java:global/bank/";
    }

}
