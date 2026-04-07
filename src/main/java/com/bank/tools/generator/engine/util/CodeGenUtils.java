package com.bank.tools.generator.engine.util;

import com.bank.tools.generator.engine.constants.GeneratorConstants;
import com.bank.tools.generator.model.DtoInfo;
import com.bank.tools.generator.model.UseCaseInfo;

import java.util.*;

/**
 * Utilitaires partagés pour la génération de code.
 * Extraits de CodeGenerationEngine pour éviter la duplication.
 */
public final class CodeGenUtils {

    private CodeGenUtils() {}

    // ===================== TYPE RESOLUTION =====================

    /** Extrait le type de base (sans génériques ni tableaux) */
    public static String extractBaseType(String type) {
        if (type == null) return "";
        if (type.contains("<")) return type.substring(0, type.indexOf('<')).trim();
        if (type.endsWith("[]")) return type.substring(0, type.length() - 2).trim();
        return type.trim();
    }

    /** Résout les imports nécessaires pour un type donné (G1) */
    public static void resolveTypeImports(String type, Set<String> imports) {
        if (type == null || type.isEmpty()) return;
        String baseType = extractBaseType(type);

        if (GeneratorConstants.TYPE_IMPORT_MAP.containsKey(baseType)) {
            imports.add(GeneratorConstants.TYPE_IMPORT_MAP.get(baseType));
        }

        // Génériques imbriqués
        int openIdx = type.indexOf('<');
        int closeIdx = type.lastIndexOf('>');
        if (openIdx >= 0 && closeIdx > openIdx) {
            String genericPart = type.substring(openIdx + 1, closeIdx);
            int depth = 0;
            int start = 0;
            for (int i = 0; i < genericPart.length(); i++) {
                char c = genericPart.charAt(i);
                if (c == '<') depth++;
                else if (c == '>') depth--;
                else if (c == ',' && depth == 0) {
                    resolveTypeImports(genericPart.substring(start, i).trim(), imports);
                    start = i + 1;
                }
            }
            resolveTypeImports(genericPart.substring(start).trim(), imports);
        }
    }

    /** Vérifie si un type est un DTO */
    public static boolean isDtoType(String type) {
        return type.endsWith("Vo") || type.endsWith("VoIn") || type.endsWith("VoOut")
                || type.endsWith("Dto") || type.endsWith("DTO")
                || type.endsWith("Input") || type.endsWith("Output")
                || type.endsWith("Request") || type.endsWith("Response");
    }

    /** Vérifie si un type est un type framework EAI */
    public static boolean isFrameworkType(String type) {
        if (type == null) return false;
        return GeneratorConstants.FRAMEWORK_TYPES.contains(extractBaseType(type));
    }

    /** Remplace un type framework EAI par Map<String, Object> */
    public static String replaceFrameworkType(String type) {
        if (type == null) return type;
        if (isFrameworkType(type)) return "Map<String, Object>";
        return type;
    }

    /** Vérifie si un champ est un logger */
    public static boolean isLoggerField(DtoInfo.FieldInfo field) {
        String name = field.getName().toLowerCase();
        String type = field.getType().toLowerCase();
        return name.equals("logger") || name.equals("log") || name.equals("log_")
                || type.contains("logger") || type.contains("log4j");
    }

    // ===================== NAMING =====================

    /** Convertit CamelCase en kebab-case */
    public static String toKebabCase(String camelCase) {
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    /** Convertit kebab-case ou snake_case en PascalCase */
    public static String toPascalCase(String input) {
        if (input == null || input.isEmpty()) return input;
        StringBuilder sb = new StringBuilder();
        for (String part : input.split("[-_]")) {
            if (!part.isEmpty()) {
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) sb.append(part.substring(1).toLowerCase());
            }
        }
        return sb.toString();
    }

    /** Met en majuscule la première lettre d'une chaîne */
    public static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /** Échappe les caractères pour les strings Java */
    public static String escapeJavaString(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    /** Dérive un résumé Swagger depuis un nom de classe ou méthode */
    public static String deriveSwaggerSummary(String name) {
        String clean = name.replaceAll("(UC|Bean|Impl|Service|EJB)$", "");
        String[] words = clean.split("(?=[A-Z])");
        return String.join(" ", words).trim().toLowerCase();
    }

    /** Mappe le type de retour Java vers le type ResponseEntity */
    public static String mapReturnType(String returnType) {
        return switch (returnType) {
            case "void" -> "Void";
            case "int" -> "Integer";
            case "long" -> "Long";
            case "double" -> "Double";
            case "float" -> "Float";
            case "boolean" -> "Boolean";
            default -> returnType;
        };
    }

    // ===================== VALIDATION =====================

    /** Valide qu'un identifiant Java est sûr (pas d'injection) */
    public static boolean isValidJavaIdentifier(String name) {
        if (name == null || name.isEmpty()) return false;
        return name.matches(GeneratorConstants.JAVA_IDENTIFIER_PATTERN);
    }

    /** Sanitise un nom pour qu'il soit un identifiant Java valide */
    public static String sanitizeJavaIdentifier(String name) {
        if (name == null) return "Unknown";
        String sanitized = name.replaceAll("[^a-zA-Z0-9_$]", "_");
        if (sanitized.isEmpty() || Character.isDigit(sanitized.charAt(0))) {
            sanitized = "_" + sanitized;
        }
        return sanitized;
    }

    // ===================== BIAN =====================

    /** Détermine la méthode HTTP pour une action BIAN */
    public static String getBianHttpMethod(String action) {
        return GeneratorConstants.BIAN_ACTION_HTTP_METHOD.getOrDefault(action, "POST");
    }

    /** Détermine si l'action BIAN nécessite un {cr-reference-id} */
    public static boolean bianActionRequiresCrId(String action) {
        return !GeneratorConstants.BIAN_ACTIONS_WITHOUT_CR_ID.contains(action);
    }

    /** Détermine le code HTTP de succès pour une action BIAN */
    public static String getBianSuccessStatus(String action) {
        return GeneratorConstants.BIAN_ACTIONS_201.contains(action) ? "201" : "200";
    }

    // ===================== EXCEPTION HTTP MAPPING =====================

    /** Résout le code HTTP à partir du nom d'une exception (BUG L) */
    public static String resolveExceptionHttpStatus(String exceptionName) {
        String lower = exceptionName.toLowerCase();
        for (var entry : GeneratorConstants.EXCEPTION_HTTP_PATTERNS) {
            String[] patterns = entry.getKey().split("\\|");
            for (String pattern : patterns) {
                if (lower.contains(pattern)) {
                    return entry.getValue();
                }
            }
        }
        return "HttpStatus.INTERNAL_SERVER_ERROR";
    }
}
