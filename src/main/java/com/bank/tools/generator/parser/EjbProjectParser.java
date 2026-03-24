package com.bank.tools.generator.parser;

import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import com.bank.tools.generator.model.UseCaseInfo;
import com.bank.tools.generator.model.UseCaseInfo.SerializationFormat;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ReturnStmt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parseur statique de projets EJB utilisant JavaParser.
 * <p>
 * Analyse les sources Java pour détecter :
 * <ul>
 *     <li>Les classes annotées {@code @Stateless}</li>
 *     <li>Les classes implémentant {@code BaseUseCase}</li>
 *     <li>Les méthodes {@code execute(ValueObject voIn)}</li>
 *     <li>Les DTO d'entrée et de sortie utilisés</li>
 *     <li>Les annotations JAXB ({@code @XmlRootElement}, {@code @XmlElement}, etc.)
 *         indiquant un format de sérialisation XML</li>
 * </ul>
 * </p>
 */
@Component
public class EjbProjectParser {

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

    private final JavaParser javaParser = new JavaParser();

    /**
     * Analyse un projet EJB situé dans le répertoire donné.
     *
     * @param projectPath chemin racine du projet EJB extrait
     * @return résultat de l'analyse contenant les UseCases et DTO détectés
     */
    public ProjectAnalysisResult analyzeProject(Path projectPath) {
        log.info("Début de l'analyse du projet EJB : {}", projectPath);

        ProjectAnalysisResult result = new ProjectAnalysisResult();
        result.setProjectPath(projectPath.toString());

        // Trouver tous les fichiers Java
        List<Path> javaFiles = findJavaFiles(projectPath);
        result.setTotalFilesAnalyzed(javaFiles.size());
        log.info("Nombre de fichiers Java trouvés : {}", javaFiles.size());

        // Première passe : parser tous les fichiers et construire un index
        Map<String, CompilationUnit> compilationUnits = new LinkedHashMap<>();
        Map<String, ClassOrInterfaceDeclaration> classIndex = new LinkedHashMap<>();

        for (Path javaFile : javaFiles) {
            try {
                ParseResult<CompilationUnit> parseResult = javaParser.parse(javaFile);
                if (parseResult.isSuccessful() && parseResult.getResult().isPresent()) {
                    CompilationUnit cu = parseResult.getResult().get();
                    compilationUnits.put(javaFile.toString(), cu);

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

        // Deuxième passe : détecter les UseCases
        Set<String> dtoClassNames = new HashSet<>();

        for (Map.Entry<String, CompilationUnit> entry : compilationUnits.entrySet()) {
            CompilationUnit cu = entry.getValue();

            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                if (isUseCase(classDecl)) {
                    UseCaseInfo useCaseInfo = extractUseCaseInfo(cu, classDecl);
                    if (useCaseInfo != null) {
                        result.addUseCase(useCaseInfo);
                        log.info("UseCase détecté : {}", useCaseInfo.getClassName());

                        if (useCaseInfo.getInputDtoClassName() != null) {
                            dtoClassNames.add(useCaseInfo.getInputDtoClassName());
                        }
                        if (useCaseInfo.getOutputDtoClassName() != null) {
                            dtoClassNames.add(useCaseInfo.getOutputDtoClassName());
                        }
                    }
                }
            }
        }

        // Troisième passe : détecter les DTO et leurs annotations JAXB
        Map<String, DtoInfo> dtoMap = new LinkedHashMap<>();

        for (Map.Entry<String, CompilationUnit> entry : compilationUnits.entrySet()) {
            CompilationUnit cu = entry.getValue();

            for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
                String className = classDecl.getNameAsString();
                if (dtoClassNames.contains(className) || isDtoCandidate(className)) {
                    DtoInfo dtoInfo = extractDtoInfo(cu, classDecl);
                    if (dtoInfo != null && !dtoMap.containsKey(dtoInfo.getFullyQualifiedName())) {
                        dtoMap.put(dtoInfo.getFullyQualifiedName(), dtoInfo);
                        log.info("DTO détecté : {} (JAXB: {})", dtoInfo.getClassName(), dtoInfo.hasJaxbAnnotations());
                    }
                }
            }
        }

        result.setDtos(new ArrayList<>(dtoMap.values()));

        // Quatrième passe : enrichir les UseCases avec les informations JAXB des DTO
        for (UseCaseInfo useCase : result.getUseCases()) {
            enrichUseCaseWithJaxbInfo(useCase, dtoMap);
        }

        log.info("Analyse terminée. UseCases : {}, DTOs : {}", result.getUseCases().size(), result.getDtos().size());
        return result;
    }

    /**
     * Enrichit un UseCase avec les informations JAXB de ses DTO associés.
     */
    private void enrichUseCaseWithJaxbInfo(UseCaseInfo useCase, Map<String, DtoInfo> dtoMap) {
        boolean inputHasJaxb = false;
        boolean outputHasJaxb = false;

        // Chercher le DTO d'entrée par nom simple
        for (DtoInfo dto : dtoMap.values()) {
            if (dto.getClassName().equals(useCase.getInputDtoClassName())) {
                inputHasJaxb = dto.hasJaxbAnnotations();
                useCase.setInputDtoHasJaxb(inputHasJaxb);
                useCase.setInputDtoPackage(dto.getPackageName());
            }
            if (dto.getClassName().equals(useCase.getOutputDtoClassName())) {
                outputHasJaxb = dto.hasJaxbAnnotations();
                useCase.setOutputDtoHasJaxb(outputHasJaxb);
                useCase.setOutputDtoPackage(dto.getPackageName());
            }
        }

        // Déterminer le format de sérialisation
        if (inputHasJaxb || outputHasJaxb) {
            useCase.setSerializationFormat(SerializationFormat.BOTH);
        } else {
            useCase.setSerializationFormat(SerializationFormat.JSON);
        }

        log.debug("UseCase {} : format = {}", useCase.getClassName(), useCase.getSerializationFormat());
    }

    /**
     * Détermine si une classe est un UseCase EJB.
     */
    private boolean isUseCase(ClassOrInterfaceDeclaration classDecl) {
        boolean hasStateless = classDecl.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals("Stateless"));

        boolean implementsBaseUseCase = classDecl.getImplementedTypes().stream()
                .anyMatch(t -> t.getNameAsString().equals(BASE_USE_CASE_INTERFACE));

        boolean hasExecute = classDecl.getMethods().stream()
                .anyMatch(m -> m.getNameAsString().equals(EXECUTE_METHOD_NAME));

        return (hasStateless || implementsBaseUseCase) && hasExecute;
    }

    /**
     * Extrait les informations d'un UseCase à partir de sa déclaration de classe.
     */
    private UseCaseInfo extractUseCaseInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl) {
        UseCaseInfo info = new UseCaseInfo();

        info.setClassName(classDecl.getNameAsString());

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString())
                .orElse("");
        info.setPackageName(packageName);
        info.setFullyQualifiedName(packageName.isEmpty() ? info.getClassName() : packageName + "." + info.getClassName());

        info.setStateless(classDecl.getAnnotations().stream()
                .anyMatch(a -> a.getNameAsString().equals("Stateless")));

        classDecl.getImplementedTypes().stream()
                .findFirst()
                .ifPresent(t -> info.setImplementedInterface(t.getNameAsString()));

        Optional<MethodDeclaration> executeMethod = classDecl.getMethods().stream()
                .filter(m -> m.getNameAsString().equals(EXECUTE_METHOD_NAME))
                .findFirst();

        if (executeMethod.isPresent()) {
            info.setHasExecuteMethod(true);
            MethodDeclaration method = executeMethod.get();

            String inputDto = detectInputDto(method);
            if (inputDto != null) {
                info.setInputDtoClassName(inputDto);
            }

            String outputDto = detectOutputDto(method);
            if (outputDto != null) {
                info.setOutputDtoClassName(outputDto);
            }

            if (info.getInputDtoClassName() == null) {
                info.setInputDtoClassName(deriveInputDtoName(info.getClassName()));
            }
            if (info.getOutputDtoClassName() == null) {
                info.setOutputDtoClassName(deriveOutputDtoName(info.getClassName()));
            }
        }

        String baseName = deriveBaseName(info.getClassName());
        info.setRestEndpoint("/api/" + toKebabCase(baseName));
        info.setControllerName(baseName + "Controller");
        info.setServiceAdapterName(baseName + "ServiceAdapter");
        info.setJndiName("java:global/bank/" + info.getClassName());

        return info;
    }

    /**
     * Détecte le DTO d'entrée en analysant les casts dans la méthode execute.
     */
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

    /**
     * Détecte le DTO de sortie en analysant les retours et casts de la méthode execute.
     */
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
                if (matcher.find()) {
                    return matcher.group(1);
                }
            }
        }

        return null;
    }

    /**
     * Extrait les informations d'un DTO, y compris les annotations JAXB.
     */
    private DtoInfo extractDtoInfo(CompilationUnit cu, ClassOrInterfaceDeclaration classDecl) {
        DtoInfo dto = new DtoInfo();
        dto.setClassName(classDecl.getNameAsString());

        String packageName = cu.getPackageDeclaration()
                .map(pd -> pd.getNameAsString())
                .orElse("");
        dto.setPackageName(packageName);
        dto.setFullyQualifiedName(packageName.isEmpty() ? dto.getClassName() : packageName + "." + dto.getClassName());

        // Détecter les annotations JAXB au niveau de la classe
        List<String> jaxbAnnotationsList = new ArrayList<>();
        for (AnnotationExpr annotation : classDecl.getAnnotations()) {
            String annotName = annotation.getNameAsString();

            if (annotName.equals("XmlRootElement")) {
                dto.setHasXmlRootElement(true);
                jaxbAnnotationsList.add("@XmlRootElement");
                // Extraire le nom si spécifié
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
                extractAnnotationValue(annotation)
                        .ifPresent(dto::setXmlAccessorTypeValue);
            }

            if (JAXB_CLASS_ANNOTATIONS.contains(annotName)) {
                if (!jaxbAnnotationsList.contains("@" + annotName)) {
                    jaxbAnnotationsList.add("@" + annotName);
                }
            }
        }
        dto.setJaxbAnnotations(jaxbAnnotationsList);

        // Extraire les champs avec détection des annotations JAXB
        for (FieldDeclaration field : classDecl.getFields()) {
            for (VariableDeclarator var : field.getVariables()) {
                String accessMod = field.getAccessSpecifier().asString();
                DtoInfo.FieldInfo fieldInfo = new DtoInfo.FieldInfo(
                        var.getNameAsString(),
                        var.getTypeAsString(),
                        accessMod
                );

                // Détecter les annotations JAXB sur les champs
                for (AnnotationExpr fieldAnnot : field.getAnnotations()) {
                    String fieldAnnotName = fieldAnnot.getNameAsString();
                    if (fieldAnnotName.equals("XmlElement")) {
                        fieldInfo.setHasXmlElement(true);
                        extractAnnotationStringAttribute(fieldAnnot, "name")
                                .ifPresent(fieldInfo::setXmlName);
                    }
                    if (fieldAnnotName.equals("XmlAttribute")) {
                        fieldInfo.setHasXmlAttribute(true);
                        extractAnnotationStringAttribute(fieldAnnot, "name")
                                .ifPresent(fieldInfo::setXmlName);
                    }
                }

                dto.getFields().add(fieldInfo);
            }
        }

        // Classe parente
        classDecl.getExtendedTypes().stream()
                .findFirst()
                .ifPresent(t -> dto.setParentClassName(t.getNameAsString()));

        // Code source
        dto.setSourceCode(classDecl.toString());

        return dto;
    }

    /**
     * Extrait la valeur d'un attribut String d'une annotation.
     * Ex: @XmlRootElement(name = "client") -> "client"
     */
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

    /**
     * Extrait la valeur brute d'une annotation (pour @XmlAccessorType par exemple).
     */
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

    /**
     * Vérifie si un nom de classe correspond à un DTO candidat.
     */
    private boolean isDtoCandidate(String className) {
        return className.endsWith("VoIn") || className.endsWith("VoOut") ||
               className.endsWith("VOIn") || className.endsWith("VOOut") ||
               className.endsWith("Vo") || className.endsWith("VO") ||
               className.endsWith("Dto") || className.endsWith("DTO") ||
               className.endsWith("Input") || className.endsWith("Output") ||
               className.endsWith("Request") || className.endsWith("Response");
    }

    private String deriveBaseName(String className) {
        if (className.endsWith("UC")) {
            return className.substring(0, className.length() - 2);
        }
        if (className.endsWith("UseCase")) {
            return className.substring(0, className.length() - 7);
        }
        return className;
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
                .map(pd -> pd.getNameAsString())
                .orElse("");
        return packageName.isEmpty() ? classDecl.getNameAsString() : packageName + "." + classDecl.getNameAsString();
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
            log.error("Erreur lors du parcours du répertoire : {}", rootPath, e);
        }
        return javaFiles;
    }
}
