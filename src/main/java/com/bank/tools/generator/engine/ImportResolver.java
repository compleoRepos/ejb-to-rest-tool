package com.bank.tools.generator.engine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Phase 8 — Resolution systemique des imports post-generation.
 *
 * Scanne dynamiquement le filesystem du projet genere pour construire
 * un index type→package, puis verifie chaque fichier .java pour ajouter
 * les imports manquants et supprimer les doublons.
 */
@Component
public class ImportResolver {

    private static final Logger log = LoggerFactory.getLogger(ImportResolver.class);

    // ===================== TYPES JAVA.LANG (pas d'import necessaire) =====================

    private static final Set<String> JAVA_LANG_TYPES = Set.of(
            "String", "Integer", "Long", "Double", "Float", "Boolean",
            "Byte", "Short", "Character", "Object", "Number", "Void",
            "Exception", "RuntimeException", "Throwable", "Class",
            "System", "Math", "Thread", "Runnable", "Override",
            "SuppressWarnings", "Deprecated", "FunctionalInterface",
            "StringBuilder", "StringBuffer", "Comparable", "Iterable",
            "AutoCloseable", "Cloneable", "Enum", "Record",
            "NullPointerException", "IllegalArgumentException",
            "IllegalStateException", "UnsupportedOperationException",
            "IndexOutOfBoundsException", "ClassCastException",
            "ArithmeticException", "ArrayIndexOutOfBoundsException",
            "StringIndexOutOfBoundsException", "ClassNotFoundException",
            "InterruptedException", "StackTraceElement"
    );

    /** Types primitifs Java (pas d'import) */
    private static final Set<String> PRIMITIVE_TYPES = Set.of(
            "int", "long", "double", "float", "boolean", "byte", "short", "char", "void"
    );

    // ===================== TABLE DE MAPPING DES TYPES JAVA STANDARD =====================

    private static final Map<String, String> STANDARD_TYPE_MAP = new LinkedHashMap<>();
    static {
        // java.math
        STANDARD_TYPE_MAP.put("BigDecimal", "java.math.BigDecimal");
        STANDARD_TYPE_MAP.put("BigInteger", "java.math.BigInteger");

        // java.util
        STANDARD_TYPE_MAP.put("List", "java.util.List");
        STANDARD_TYPE_MAP.put("ArrayList", "java.util.ArrayList");
        STANDARD_TYPE_MAP.put("Map", "java.util.Map");
        STANDARD_TYPE_MAP.put("HashMap", "java.util.HashMap");
        STANDARD_TYPE_MAP.put("LinkedHashMap", "java.util.LinkedHashMap");
        STANDARD_TYPE_MAP.put("Set", "java.util.Set");
        STANDARD_TYPE_MAP.put("HashSet", "java.util.HashSet");
        STANDARD_TYPE_MAP.put("LinkedHashSet", "java.util.LinkedHashSet");
        STANDARD_TYPE_MAP.put("TreeSet", "java.util.TreeSet");
        STANDARD_TYPE_MAP.put("TreeMap", "java.util.TreeMap");
        STANDARD_TYPE_MAP.put("LinkedList", "java.util.LinkedList");
        STANDARD_TYPE_MAP.put("Optional", "java.util.Optional");
        STANDARD_TYPE_MAP.put("Date", "java.util.Date");
        STANDARD_TYPE_MAP.put("Calendar", "java.util.Calendar");
        STANDARD_TYPE_MAP.put("UUID", "java.util.UUID");
        STANDARD_TYPE_MAP.put("Arrays", "java.util.Arrays");
        STANDARD_TYPE_MAP.put("Collections", "java.util.Collections");
        STANDARD_TYPE_MAP.put("Collection", "java.util.Collection");
        STANDARD_TYPE_MAP.put("Iterator", "java.util.Iterator");
        STANDARD_TYPE_MAP.put("Comparator", "java.util.Comparator");
        STANDARD_TYPE_MAP.put("Objects", "java.util.Objects");
        STANDARD_TYPE_MAP.put("Properties", "java.util.Properties");
        STANDARD_TYPE_MAP.put("Hashtable", "java.util.Hashtable");
        STANDARD_TYPE_MAP.put("Queue", "java.util.Queue");
        STANDARD_TYPE_MAP.put("Deque", "java.util.Deque");

        // java.time
        STANDARD_TYPE_MAP.put("LocalDate", "java.time.LocalDate");
        STANDARD_TYPE_MAP.put("LocalDateTime", "java.time.LocalDateTime");
        STANDARD_TYPE_MAP.put("LocalTime", "java.time.LocalTime");
        STANDARD_TYPE_MAP.put("Instant", "java.time.Instant");
        STANDARD_TYPE_MAP.put("ZonedDateTime", "java.time.ZonedDateTime");
        STANDARD_TYPE_MAP.put("Duration", "java.time.Duration");
        STANDARD_TYPE_MAP.put("Period", "java.time.Period");
        STANDARD_TYPE_MAP.put("ZoneId", "java.time.ZoneId");

        // java.io
        STANDARD_TYPE_MAP.put("Serializable", "java.io.Serializable");
        STANDARD_TYPE_MAP.put("InputStream", "java.io.InputStream");
        STANDARD_TYPE_MAP.put("OutputStream", "java.io.OutputStream");
        STANDARD_TYPE_MAP.put("IOException", "java.io.IOException");

        // javax.naming
        STANDARD_TYPE_MAP.put("InitialContext", "javax.naming.InitialContext");
        STANDARD_TYPE_MAP.put("NamingException", "javax.naming.NamingException");
        STANDARD_TYPE_MAP.put("Context", "javax.naming.Context");
    }

    // ===================== TABLE DE MAPPING DES ANNOTATIONS =====================

    private static final Map<String, String> ANNOTATION_IMPORT_MAP = new LinkedHashMap<>();
    static {
        // Jakarta Validation
        ANNOTATION_IMPORT_MAP.put("Size", "jakarta.validation.constraints.Size");
        ANNOTATION_IMPORT_MAP.put("NotBlank", "jakarta.validation.constraints.NotBlank");
        ANNOTATION_IMPORT_MAP.put("NotNull", "jakarta.validation.constraints.NotNull");
        ANNOTATION_IMPORT_MAP.put("NotEmpty", "jakarta.validation.constraints.NotEmpty");
        ANNOTATION_IMPORT_MAP.put("Min", "jakarta.validation.constraints.Min");
        ANNOTATION_IMPORT_MAP.put("Max", "jakarta.validation.constraints.Max");
        ANNOTATION_IMPORT_MAP.put("Valid", "jakarta.validation.Valid");
        ANNOTATION_IMPORT_MAP.put("Email", "jakarta.validation.constraints.Email");
        ANNOTATION_IMPORT_MAP.put("Positive", "jakarta.validation.constraints.Positive");
        ANNOTATION_IMPORT_MAP.put("PositiveOrZero", "jakarta.validation.constraints.PositiveOrZero");
        ANNOTATION_IMPORT_MAP.put("Negative", "jakarta.validation.constraints.Negative");
        ANNOTATION_IMPORT_MAP.put("NegativeOrZero", "jakarta.validation.constraints.NegativeOrZero");
        ANNOTATION_IMPORT_MAP.put("Past", "jakarta.validation.constraints.Past");
        ANNOTATION_IMPORT_MAP.put("Future", "jakarta.validation.constraints.Future");
        ANNOTATION_IMPORT_MAP.put("Pattern", "jakarta.validation.constraints.Pattern");
        ANNOTATION_IMPORT_MAP.put("Digits", "jakarta.validation.constraints.Digits");

        // Jackson
        ANNOTATION_IMPORT_MAP.put("JsonIgnore", "com.fasterxml.jackson.annotation.JsonIgnore");
        ANNOTATION_IMPORT_MAP.put("JsonProperty", "com.fasterxml.jackson.annotation.JsonProperty");
        ANNOTATION_IMPORT_MAP.put("JsonValue", "com.fasterxml.jackson.annotation.JsonValue");
        ANNOTATION_IMPORT_MAP.put("JsonCreator", "com.fasterxml.jackson.annotation.JsonCreator");
        ANNOTATION_IMPORT_MAP.put("JsonFormat", "com.fasterxml.jackson.annotation.JsonFormat");
        ANNOTATION_IMPORT_MAP.put("JsonInclude", "com.fasterxml.jackson.annotation.JsonInclude");

        // Spring Security
        ANNOTATION_IMPORT_MAP.put("PreAuthorize", "org.springframework.security.access.prepost.PreAuthorize");
        ANNOTATION_IMPORT_MAP.put("EnableMethodSecurity", "org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity");

        // Spring Web
        ANNOTATION_IMPORT_MAP.put("DateTimeFormat", "org.springframework.format.annotation.DateTimeFormat");

        // Spring HTTP
        ANNOTATION_IMPORT_MAP.put("HttpHeaders", "org.springframework.http.HttpHeaders");
        ANNOTATION_IMPORT_MAP.put("MediaType", "org.springframework.http.MediaType");
        ANNOTATION_IMPORT_MAP.put("ContentDisposition", "org.springframework.http.ContentDisposition");
    }

    // ===================== REGEX POUR DETECTER LES TYPES UTILISES =====================

    /** Detecte les types dans les declarations de champs, parametres, retours, casts, generiques */
    private static final Pattern TYPE_USAGE_PATTERN = Pattern.compile(
            "(?:(?:private|protected|public|final|static|abstract|transient|volatile)\\s+)*" +
            "([A-Z][A-Za-z0-9_]*)" +  // Type principal (commence par majuscule)
            "(?:<([^>]+)>)?"           // Generiques optionnels
    );

    /** Detecte les annotations utilisees */
    private static final Pattern ANNOTATION_PATTERN = Pattern.compile(
            "@([A-Z][A-Za-z0-9_]*)(?:\\(|\\s|$)"
    );

    /** Detecte les types dans les throws */
    private static final Pattern THROWS_PATTERN = Pattern.compile(
            "throws\\s+([A-Za-z0-9_,\\s]+)"
    );

    /** Detecte les types dans les casts */
    private static final Pattern CAST_PATTERN = Pattern.compile(
            "\\(([A-Z][A-Za-z0-9_]*)\\)\\s*(?:ctx\\.|lookup|get)"
    );

    /** Detecte les types dans les extends/implements */
    private static final Pattern EXTENDS_PATTERN = Pattern.compile(
            "(?:extends|implements)\\s+([A-Za-z0-9_,\\s<>]+)"
    );

    /** Detecte les lignes d'import existantes */
    private static final Pattern IMPORT_LINE_PATTERN = Pattern.compile(
            "^import\\s+(static\\s+)?([a-zA-Z0-9_.]+);\\s*$"
    );

    /** Detecte la ligne package */
    private static final Pattern PACKAGE_PATTERN = Pattern.compile(
            "^package\\s+([a-zA-Z0-9_.]+);\\s*$"
    );

    // ===================== POINT D'ENTREE =====================

    /**
     * Resout tous les imports manquants dans le projet genere.
     * @param projectRoot racine du projet genere (generated-api/)
     * @return nombre de fichiers modifies
     */
    public int resolveImports(Path projectRoot) throws IOException {
        log.info("[ImportResolver] Debut de la resolution des imports dans : {}", projectRoot);

        // Phase 1 : Construire l'index type→package en scannant le filesystem
        Map<String, String> projectTypeIndex = buildProjectTypeIndex(projectRoot);
        log.info("[ImportResolver] Index construit : {} types du projet indexes", projectTypeIndex.size());

        // Phase 2 : Scanner chaque fichier .java et resoudre les imports
        int modifiedCount = 0;
        List<Path> javaFiles = findAllJavaFiles(projectRoot);
        log.info("[ImportResolver] {} fichiers .java a analyser", javaFiles.size());

        for (Path javaFile : javaFiles) {
            if (resolveImportsForFile(javaFile, projectTypeIndex)) {
                modifiedCount++;
            }
        }

        log.info("[ImportResolver] Terminé : {} fichiers modifies sur {}", modifiedCount, javaFiles.size());
        return modifiedCount;
    }

    // ===================== PHASE 1 : CONSTRUCTION DE L'INDEX =====================

    /**
     * Scanne le filesystem du projet genere pour construire un index
     * type→fully-qualified-name pour tous les fichiers .java.
     */
    private Map<String, String> buildProjectTypeIndex(Path projectRoot) throws IOException {
        Map<String, String> index = new LinkedHashMap<>();
        Path srcMain = projectRoot.resolve("src/main/java");
        if (!Files.exists(srcMain)) {
            log.warn("[ImportResolver] Repertoire src/main/java non trouve");
            return index;
        }

        try (Stream<Path> walk = Files.walk(srcMain)) {
            walk.filter(p -> p.toString().endsWith(".java"))
                .forEach(javaFile -> {
                    String fileName = javaFile.getFileName().toString();
                    String typeName = fileName.replace(".java", "");

                    // Calculer le package a partir du chemin relatif
                    Path relative = srcMain.relativize(javaFile.getParent());
                    String packageName = relative.toString().replace('/', '.').replace('\\', '.');

                    if (!packageName.isEmpty()) {
                        index.put(typeName, packageName + "." + typeName);
                    }
                });
        }

        return index;
    }

    // ===================== PHASE 2 : RESOLUTION PAR FICHIER =====================

    /**
     * Analyse un fichier .java et ajoute les imports manquants.
     * @return true si le fichier a ete modifie
     */
    private boolean resolveImportsForFile(Path javaFile, Map<String, String> projectTypeIndex) throws IOException {
        String content = Files.readString(javaFile);
        String fileName = javaFile.getFileName().toString().replace(".java", "");

        // Extraire le package du fichier
        String filePackage = extractPackage(content);

        // Collecter les imports existants
        Set<String> existingImports = extractExistingImports(content);

        // Collecter tous les types utilises dans le fichier
        Set<String> usedTypes = collectUsedTypes(content);

        // Resoudre les imports manquants
        Set<String> newImports = new TreeSet<>(); // TreeSet pour tri alphabetique

        for (String type : usedTypes) {
            // Ignorer le type du fichier lui-meme
            if (type.equals(fileName)) continue;

            // Ignorer les primitifs et java.lang
            if (PRIMITIVE_TYPES.contains(type) || JAVA_LANG_TYPES.contains(type)) continue;

            // Ignorer les types deja importes
            String fqn = findFullyQualifiedName(type, projectTypeIndex);
            if (fqn == null) continue;

            // Ignorer si meme package
            String importPackage = fqn.substring(0, fqn.lastIndexOf('.'));
            if (importPackage.equals(filePackage)) continue;

            // Verifier si deja importe
            if (existingImports.contains(fqn)) continue;

            // Verifier si un import wildcard couvre ce type
            if (existingImports.stream().anyMatch(imp -> imp.endsWith(".*") &&
                    fqn.startsWith(imp.substring(0, imp.length() - 1)))) continue;

            newImports.add("import " + fqn + ";");
        }

        // Dedupliquer les imports existants
        boolean hasDuplicates = hasDuplicateImports(content);

        if (newImports.isEmpty() && !hasDuplicates) {
            return false; // Rien a modifier
        }

        // Modifier le fichier
        String newContent = rebuildFileWithImports(content, newImports, hasDuplicates);

        if (!newContent.equals(content)) {
            Files.writeString(javaFile, newContent);
            if (!newImports.isEmpty()) {
                log.info("[ImportResolver] {} : {} imports ajoutes", fileName, newImports.size());
            }
            if (hasDuplicates) {
                log.info("[ImportResolver] {} : imports dupliques supprimes", fileName);
            }
            return true;
        }

        return false;
    }

    // ===================== EXTRACTION DES TYPES UTILISES =====================

    /**
     * Collecte tous les types utilises dans un fichier Java.
     */
    private Set<String> collectUsedTypes(String content) {
        Set<String> types = new LinkedHashSet<>();

        // Ignorer les lignes de commentaires, imports et package
        String[] lines = content.split("\n");
        StringBuilder codeOnly = new StringBuilder();
        boolean inBlockComment = false;
        for (String line : lines) {
            String trimmed = line.trim();
            if (inBlockComment) {
                if (trimmed.contains("*/")) {
                    inBlockComment = false;
                }
                continue;
            }
            if (trimmed.startsWith("/*")) {
                if (!trimmed.contains("*/")) {
                    inBlockComment = true;
                }
                continue;
            }
            if (trimmed.startsWith("//") || trimmed.startsWith("import ") || trimmed.startsWith("package ")) {
                continue;
            }
            codeOnly.append(line).append("\n");
        }

        String code = codeOnly.toString();

        // 1. Types dans les declarations (champs, parametres, retours)
        Matcher typeMatcher = TYPE_USAGE_PATTERN.matcher(code);
        while (typeMatcher.find()) {
            String mainType = typeMatcher.group(1);
            if (mainType != null && mainType.length() > 1) {
                types.add(mainType);
            }
            // Types generiques
            String generics = typeMatcher.group(2);
            if (generics != null) {
                extractGenericTypes(generics, types);
            }
        }

        // 2. Annotations
        Matcher annotMatcher = ANNOTATION_PATTERN.matcher(code);
        while (annotMatcher.find()) {
            String annotName = annotMatcher.group(1);
            if (annotName != null && !annotName.equals("Override") && !annotName.equals("SuppressWarnings")
                    && !annotName.equals("Deprecated") && !annotName.equals("FunctionalInterface")) {
                types.add(annotName);
            }
        }

        // 3. Types dans les throws
        Matcher throwsMatcher = THROWS_PATTERN.matcher(code);
        while (throwsMatcher.find()) {
            String throwsClause = throwsMatcher.group(1);
            for (String t : throwsClause.split(",")) {
                String trimmedType = t.trim();
                if (!trimmedType.isEmpty() && Character.isUpperCase(trimmedType.charAt(0))) {
                    types.add(trimmedType);
                }
            }
        }

        // 4. Types dans les casts
        Matcher castMatcher = CAST_PATTERN.matcher(code);
        while (castMatcher.find()) {
            String castType = castMatcher.group(1);
            if (castType != null) {
                types.add(castType);
            }
        }

        // 5. Types dans extends/implements
        Matcher extMatcher = EXTENDS_PATTERN.matcher(code);
        while (extMatcher.find()) {
            String clause = extMatcher.group(1);
            for (String t : clause.split(",")) {
                String trimmedType = t.trim().replaceAll("<.*>", "");
                if (!trimmedType.isEmpty() && Character.isUpperCase(trimmedType.charAt(0))) {
                    types.add(trimmedType);
                }
            }
        }

        // 6. Types dans les new XXX()
        Pattern newPattern = Pattern.compile("new\\s+([A-Z][A-Za-z0-9_]*)(?:<[^>]*>)?\\s*\\(");
        Matcher newMatcher = newPattern.matcher(code);
        while (newMatcher.find()) {
            types.add(newMatcher.group(1));
        }

        // 7. Types statiques (XXX.method() ou XXX.CONSTANT)
        Pattern staticPattern = Pattern.compile("([A-Z][A-Za-z0-9_]*)\\.(?:[a-z][A-Za-z0-9_]*|[A-Z_]+)");
        Matcher staticMatcher = staticPattern.matcher(code);
        while (staticMatcher.find()) {
            types.add(staticMatcher.group(1));
        }

        return types;
    }

    /**
     * Extrait les types des generiques (ex: "String, List<AccountDetailDto>" → ["String", "List", "AccountDetailDto"])
     */
    private void extractGenericTypes(String generics, Set<String> types) {
        // Parcours intelligent tenant compte de la profondeur des chevrons
        int depth = 0;
        StringBuilder current = new StringBuilder();
        for (char c : generics.toCharArray()) {
            if (c == '<') {
                depth++;
                // Ajouter le type avant le <
                String type = current.toString().trim();
                if (!type.isEmpty() && Character.isUpperCase(type.charAt(0))) {
                    types.add(type);
                }
                current = new StringBuilder();
            } else if (c == '>') {
                depth--;
                String type = current.toString().trim();
                if (!type.isEmpty() && Character.isUpperCase(type.charAt(0))) {
                    types.add(type);
                }
                current = new StringBuilder();
            } else if (c == ',' && depth == 0) {
                String type = current.toString().trim();
                if (!type.isEmpty() && Character.isUpperCase(type.charAt(0))) {
                    types.add(type);
                }
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        // Dernier element
        String lastType = current.toString().trim();
        if (!lastType.isEmpty() && Character.isUpperCase(lastType.charAt(0))) {
            types.add(lastType);
        }
    }

    // ===================== RESOLUTION DES NOMS QUALIFIES =====================

    /**
     * Trouve le fully-qualified-name d'un type en cherchant dans :
     * 1. L'index du projet (scan filesystem)
     * 2. La table des types Java standard
     * 3. La table des annotations
     */
    private String findFullyQualifiedName(String type, Map<String, String> projectTypeIndex) {
        // 1. Chercher dans l'index du projet (priorite haute)
        if (projectTypeIndex.containsKey(type)) {
            return projectTypeIndex.get(type);
        }

        // 2. Chercher dans les types Java standard
        if (STANDARD_TYPE_MAP.containsKey(type)) {
            return STANDARD_TYPE_MAP.get(type);
        }

        // 3. Chercher dans les annotations
        if (ANNOTATION_IMPORT_MAP.containsKey(type)) {
            return ANNOTATION_IMPORT_MAP.get(type);
        }

        // Type non resolu — probablement un type du meme package ou un faux positif
        return null;
    }

    // ===================== MANIPULATION DES IMPORTS =====================

    private String extractPackage(String content) {
        Matcher m = PACKAGE_PATTERN.matcher(content);
        while (m.find()) {
            // On cherche ligne par ligne
        }
        // Chercher ligne par ligne
        for (String line : content.split("\n")) {
            Matcher pm = PACKAGE_PATTERN.matcher(line.trim());
            if (pm.matches()) {
                return pm.group(1);
            }
        }
        return "";
    }

    private Set<String> extractExistingImports(String content) {
        Set<String> imports = new LinkedHashSet<>();
        for (String line : content.split("\n")) {
            Matcher m = IMPORT_LINE_PATTERN.matcher(line.trim());
            if (m.matches()) {
                imports.add(m.group(2)); // Le FQN sans "import" et ";"
            }
        }
        return imports;
    }

    private boolean hasDuplicateImports(String content) {
        List<String> importLines = new ArrayList<>();
        for (String line : content.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("import ")) {
                importLines.add(trimmed);
            }
        }
        return importLines.size() != new HashSet<>(importLines).size();
    }

    /**
     * Reconstruit le fichier avec les imports corriges :
     * - Ajoute les nouveaux imports
     * - Supprime les doublons
     * - Trie les imports par groupe (java, jakarta, org, com)
     */
    private String rebuildFileWithImports(String content, Set<String> newImports, boolean dedup) {
        String[] lines = content.split("\n", -1);
        StringBuilder result = new StringBuilder();

        // Collecter toutes les lignes d'import existantes
        Set<String> allImports = new LinkedHashSet<>();
        int firstImportLine = -1;
        int lastImportLine = -1;
        String packageLine = null;

        for (int i = 0; i < lines.length; i++) {
            String trimmed = lines[i].trim();
            if (trimmed.startsWith("package ")) {
                packageLine = lines[i];
            }
            if (trimmed.startsWith("import ")) {
                if (firstImportLine == -1) firstImportLine = i;
                lastImportLine = i;
                allImports.add(trimmed);
            }
        }

        // Ajouter les nouveaux imports
        allImports.addAll(newImports);

        // Trier les imports par groupe
        List<String> sortedImports = sortImports(allImports);

        // Reconstruire le fichier
        if (firstImportLine == -1) {
            // Pas d'imports existants — ajouter apres le package
            for (int i = 0; i < lines.length; i++) {
                result.append(lines[i]).append("\n");
                if (lines[i].trim().startsWith("package ") && !sortedImports.isEmpty()) {
                    result.append("\n");
                    for (String imp : sortedImports) {
                        result.append(imp).append("\n");
                    }
                }
            }
        } else {
            // Remplacer la section imports existante
            for (int i = 0; i < lines.length; i++) {
                if (i == firstImportLine) {
                    // Ecrire tous les imports tries
                    for (String imp : sortedImports) {
                        result.append(imp).append("\n");
                    }
                } else if (i > firstImportLine && i <= lastImportLine) {
                    String trimmed = lines[i].trim();
                    // Sauter les anciennes lignes d'import et les lignes vides entre imports
                    if (trimmed.startsWith("import ") || trimmed.isEmpty()) {
                        continue;
                    }
                    result.append(lines[i]).append("\n");
                } else {
                    result.append(lines[i]).append("\n");
                }
            }
        }

        // Supprimer le dernier \n en trop si le fichier original n'en avait pas
        String resultStr = result.toString();
        if (!content.endsWith("\n") && resultStr.endsWith("\n")) {
            resultStr = resultStr.substring(0, resultStr.length() - 1);
        }

        return resultStr;
    }

    /**
     * Trie les imports par groupe avec une ligne vide entre chaque groupe :
     * 1. java.*
     * 2. javax.*
     * 3. jakarta.*
     * 4. org.*
     * 5. com.*
     */
    private List<String> sortImports(Set<String> imports) {
        Map<Integer, List<String>> groups = new TreeMap<>();
        for (String imp : imports) {
            String fqn = imp.replace("import ", "").replace("import static ", "").replace(";", "").trim();
            int group;
            if (fqn.startsWith("java.")) group = 1;
            else if (fqn.startsWith("javax.")) group = 2;
            else if (fqn.startsWith("jakarta.")) group = 3;
            else if (fqn.startsWith("org.")) group = 4;
            else if (fqn.startsWith("com.")) group = 5;
            else group = 6;
            groups.computeIfAbsent(group, k -> new ArrayList<>()).add(imp);
        }

        List<String> result = new ArrayList<>();
        boolean first = true;
        for (Map.Entry<Integer, List<String>> entry : groups.entrySet()) {
            if (!first) {
                result.add(""); // Ligne vide entre les groupes
            }
            List<String> sorted = entry.getValue().stream().sorted().collect(Collectors.toList());
            result.addAll(sorted);
            first = false;
        }
        return result;
    }

    // ===================== UTILITAIRES =====================

    private List<Path> findAllJavaFiles(Path projectRoot) throws IOException {
        Path srcMain = projectRoot.resolve("src/main/java");
        Path srcTest = projectRoot.resolve("src/test/java");

        List<Path> files = new ArrayList<>();

        if (Files.exists(srcMain)) {
            try (Stream<Path> walk = Files.walk(srcMain)) {
                walk.filter(p -> p.toString().endsWith(".java")).forEach(files::add);
            }
        }

        if (Files.exists(srcTest)) {
            try (Stream<Path> walk = Files.walk(srcTest)) {
                walk.filter(p -> p.toString().endsWith(".java")).forEach(files::add);
            }
        }

        return files;
    }
}
