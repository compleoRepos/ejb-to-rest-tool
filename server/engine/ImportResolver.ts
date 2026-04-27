/**
 * ImportResolver — Résolution automatique des imports Java manquants.
 *
 * Analyse le code Java généré et injecte les imports nécessaires pour :
 * - Types Java stdlib (BigDecimal, LocalDate, List, Map, etc.)
 * - Annotations Spring (@Transactional, @Service, ResponseEntity, etc.)
 * - Annotations Lombok (@Slf4j, @Data, @Builder, etc.)
 * - Annotations Jakarta Validation (@NotBlank, @Valid, etc.)
 * - DTOs du projet courant (Request/Response)
 * - Exceptions du projet courant
 *
 * @author Compleo
 */

import type { ProjectIR } from "../java-parser";

export class ImportResolver {

  // ─── Mapping type → import complet ────────────────────────────────────────

  private static readonly JAVA_STDLIB: Record<string, string> = {
    "BigDecimal":     "java.math.BigDecimal",
    "BigInteger":     "java.math.BigInteger",
    "LocalDate":      "java.time.LocalDate",
    "LocalDateTime":  "java.time.LocalDateTime",
    "LocalTime":      "java.time.LocalTime",
    "Instant":        "java.time.Instant",
    "ZonedDateTime":  "java.time.ZonedDateTime",
    "Duration":       "java.time.Duration",
    "List":           "java.util.List",
    "Map":            "java.util.Map",
    "Set":            "java.util.Set",
    "ArrayList":      "java.util.ArrayList",
    "HashMap":        "java.util.HashMap",
    "HashSet":        "java.util.HashSet",
    "LinkedList":     "java.util.LinkedList",
    "TreeMap":        "java.util.TreeMap",
    "Optional":       "java.util.Optional",
    "Arrays":         "java.util.Arrays",
    "Collections":    "java.util.Collections",
    "Date":           "java.util.Date",
    "UUID":           "java.util.UUID",
    "Objects":        "java.util.Objects",
    "Stream":         "java.util.stream.Stream",
    "Collectors":     "java.util.stream.Collectors",
    "URI":            "java.net.URI",
    "URL":            "java.net.URL",
    "IOException":    "java.io.IOException",
    "Serializable":   "java.io.Serializable",
    "InputStream":    "java.io.InputStream",
    "OutputStream":   "java.io.OutputStream",
    "BufferedReader": "java.io.BufferedReader",
    "InputStreamReader": "java.io.InputStreamReader",
    "RoundingMode":   "java.math.RoundingMode",
    "MathContext":    "java.math.MathContext",
    "NumberFormat":   "java.text.NumberFormat",
    "DecimalFormat":  "java.text.DecimalFormat",
    "SimpleDateFormat": "java.text.SimpleDateFormat",
    "DateTimeFormatter": "java.time.format.DateTimeFormatter",
    "ChronoUnit":     "java.time.temporal.ChronoUnit",
    "Period":         "java.time.Period",
    "Pattern":        "java.util.regex.Pattern",
    "Matcher":        "java.util.regex.Matcher",
    "LinkedHashMap":  "java.util.LinkedHashMap",
    "TreeSet":        "java.util.TreeSet",
    "Queue":          "java.util.Queue",
    "Deque":          "java.util.Deque",
    "Iterator":       "java.util.Iterator",
    "Comparator":     "java.util.Comparator",
    "StringUtils":    "org.springframework.util.StringUtils",
    "StringJoiner":   "java.util.StringJoiner",
    "Base64":         "java.util.Base64",
    "Charset":        "java.nio.charset.Charset",
    "StandardCharsets": "java.nio.charset.StandardCharsets",
  };

  private static readonly SPRING_IMPORTS: Record<string, string> = {
    "Transactional":    "org.springframework.transaction.annotation.Transactional",
    "Service":          "org.springframework.stereotype.Service",
    "Component":        "org.springframework.stereotype.Component",
    "Repository":       "org.springframework.stereotype.Repository",
    "Autowired":        "org.springframework.beans.factory.annotation.Autowired",
    "Value":            "org.springframework.beans.factory.annotation.Value",
    "RestTemplate":     "org.springframework.web.client.RestTemplate",
    "HttpHeaders":      "org.springframework.http.HttpHeaders",
    "HttpEntity":       "org.springframework.http.HttpEntity",
    "ResponseEntity":   "org.springframework.http.ResponseEntity",
    "HttpStatus":       "org.springframework.http.HttpStatus",
    "MediaType":        "org.springframework.http.MediaType",
    "RestController":   "org.springframework.web.bind.annotation.RestController",
    "RequestMapping":   "org.springframework.web.bind.annotation.RequestMapping",
    "GetMapping":       "org.springframework.web.bind.annotation.GetMapping",
    "PostMapping":      "org.springframework.web.bind.annotation.PostMapping",
    "PutMapping":       "org.springframework.web.bind.annotation.PutMapping",
    "DeleteMapping":    "org.springframework.web.bind.annotation.DeleteMapping",
    "PatchMapping":     "org.springframework.web.bind.annotation.PatchMapping",
    "PathVariable":     "org.springframework.web.bind.annotation.PathVariable",
    "RequestBody":      "org.springframework.web.bind.annotation.RequestBody",
    "RequestParam":     "org.springframework.web.bind.annotation.RequestParam",
    "RequestHeader":    "org.springframework.web.bind.annotation.RequestHeader",
    "ConditionalOnMissingBean": "org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean",
    "Primary":          "org.springframework.context.annotation.Primary",
    "SpringBootApplication": "org.springframework.boot.autoconfigure.SpringBootApplication",
    "WebClient":        "org.springframework.web.reactive.function.client.WebClient",
    "ObjectMapper":     "com.fasterxml.jackson.databind.ObjectMapper",
    "JsonNode":         "com.fasterxml.jackson.databind.JsonNode",
    "JsonProperty":     "com.fasterxml.jackson.annotation.JsonProperty",
    "JsonIgnore":       "com.fasterxml.jackson.annotation.JsonIgnore",
    "JsonFormat":       "com.fasterxml.jackson.annotation.JsonFormat",
    "Entity":           "jakarta.persistence.Entity",
    "Table":            "jakarta.persistence.Table",
    "Id":              "jakarta.persistence.Id",
    "GeneratedValue":   "jakarta.persistence.GeneratedValue",
    "GenerationType":   "jakarta.persistence.GenerationType",
    "Column":           "jakarta.persistence.Column",
    "JoinColumn":       "jakarta.persistence.JoinColumn",
    "ManyToOne":        "jakarta.persistence.ManyToOne",
    "OneToMany":        "jakarta.persistence.OneToMany",
    "ManyToMany":       "jakarta.persistence.ManyToMany",
    "Enumerated":       "jakarta.persistence.Enumerated",
    "EnumType":         "jakarta.persistence.EnumType",
    "JpaRepository":    "org.springframework.data.jpa.repository.JpaRepository",
    "Query":            "org.springframework.data.jpa.repository.Query",
    "Param":            "org.springframework.data.repository.query.Param",
    "Page":             "org.springframework.data.domain.Page",
    "Pageable":         "org.springframework.data.domain.Pageable",
    "PageRequest":      "org.springframework.data.domain.PageRequest",
  };

  private static readonly LOMBOK_IMPORTS: Record<string, string> = {
    "Slf4j":                "lombok.extern.slf4j.Slf4j",
    "RequiredArgsConstructor": "lombok.RequiredArgsConstructor",
    "Data":                 "lombok.Data",
    "Builder":              "lombok.Builder",
    "NoArgsConstructor":    "lombok.NoArgsConstructor",
    "AllArgsConstructor":   "lombok.AllArgsConstructor",
    "Getter":               "lombok.Getter",
    "Setter":               "lombok.Setter",
    "ToString":             "lombok.ToString",
    "EqualsAndHashCode":    "lombok.EqualsAndHashCode",
  };

  private static readonly JAKARTA_IMPORTS: Record<string, string> = {
    "NotBlank":     "jakarta.validation.constraints.NotBlank",
    "NotNull":      "jakarta.validation.constraints.NotNull",
    "NotEmpty":     "jakarta.validation.constraints.NotEmpty",
    "Valid":        "jakarta.validation.Valid",
    "Pattern":      "jakarta.validation.constraints.Pattern",
    "Size":         "jakarta.validation.constraints.Size",
    "DecimalMin":   "jakarta.validation.constraints.DecimalMin",
    "DecimalMax":   "jakarta.validation.constraints.DecimalMax",
    "Min":          "jakarta.validation.constraints.Min",
    "Max":          "jakarta.validation.constraints.Max",
    "Digits":       "jakarta.validation.constraints.Digits",
    "Positive":     "jakarta.validation.constraints.Positive",
    "PositiveOrZero": "jakarta.validation.constraints.PositiveOrZero",
    "Email":        "jakarta.validation.constraints.Email",
  };

  private static readonly SWAGGER_IMPORTS: Record<string, string> = {
    "Operation":    "io.swagger.v3.oas.annotations.Operation",
    "Tag":          "io.swagger.v3.oas.annotations.tags.Tag",
    "ApiResponse":  "io.swagger.v3.oas.annotations.responses.ApiResponse",
    "Parameter":    "io.swagger.v3.oas.annotations.Parameter",
    "Schema":       "io.swagger.v3.oas.annotations.media.Schema",
  };

  /**
   * Analyser le code Java et retourner la liste d'imports nécessaires.
   */
  resolveImports(
    javaCode: string,
    packageName: string,
    projectIR?: ProjectIR
  ): string[] {
    const needed = new Set<string>();
    const allMaps = [
      ImportResolver.JAVA_STDLIB,
      ImportResolver.SPRING_IMPORTS,
      ImportResolver.LOMBOK_IMPORTS,
      ImportResolver.JAKARTA_IMPORTS,
      ImportResolver.SWAGGER_IMPORTS,
    ];

    // Collect existing imports to avoid duplicates
    const existingImports = new Set(
      (javaCode.match(/^import .+;$/gm) ?? []).map(i => i.trim())
    );

    // 1. Scanner les types utilisés dans le code
    // Pattern : word boundary + UpperCamelCase identifier
    const typePattern = /\b([A-Z][a-zA-Z0-9]*)\b/g;
    let match: RegExpExecArray | null;
    const usedTypes = new Set<string>();

    while ((match = typePattern.exec(javaCode)) !== null) {
      usedTypes.add(match[1]);
    }

    // Chercher dans les mappings connus
    for (const typeName of usedTypes) {
      for (const map of allMaps) {
        if (map[typeName]) {
          const imp = `import ${map[typeName]};`;
          if (!existingImports.has(imp)) {
            needed.add(imp);
          }
          break;
        }
      }
    }

    // 2. Ajouter les imports pour les DTOs du projet courant
    if (projectIR) {
      for (const dto of projectIR.dtos) {
        // Check both original and mapped names
        const mappedName = dto.className
          .replace(/VoIn$/, "RequestDTO")
          .replace(/VoOut$/, "ResponseDTO");

        if (usedTypes.has(mappedName)) {
          const imp = `import ${packageName}.dto.${mappedName};`;
          if (!existingImports.has(imp)) {
            needed.add(imp);
          }
        }
        // Also check the original DTO name
        if (usedTypes.has(dto.className)) {
          const imp = `import ${packageName}.dto.${dto.className};`;
          if (!existingImports.has(imp)) {
            needed.add(imp);
          }
        }
      }

      // 3. Ajouter les imports pour les exceptions du projet
      for (const exc of projectIR.exceptions ?? []) {
        if (usedTypes.has(exc.className)) {
          const imp = `import ${packageName}.exception.${exc.className};`;
          if (!existingImports.has(imp)) {
            needed.add(imp);
          }
        }
      }

      // 4. Ajouter les imports pour les enums du projet
      for (const en of projectIR.enums ?? []) {
        if (usedTypes.has(en.className)) {
          const imp = `import ${packageName}.model.${en.className};`;
          if (!existingImports.has(imp)) {
            needed.add(imp);
          }
        }
      }
    }

    // 5. Supprimer les imports du même package (inutiles en Java)
    const filtered = [...needed].filter(imp => {
      const importedPkg = imp
        .replace("import ", "")
        .replace(";", "")
        .split(".")
        .slice(0, -1)
        .join(".");
      return importedPkg !== packageName;
    });

    return filtered.sort();
  }

  /**
   * Injecter les imports dans un fichier Java généré.
   * Insère après la déclaration de package, avant le reste du code.
   */
  injectImports(javaCode: string, imports: string[]): string {
    if (imports.length === 0) return javaCode;

    // Trouver la ligne "package xxx;"
    const pkgMatch = javaCode.match(/^package\s+[\w.]+;\s*$/m);
    if (!pkgMatch) return javaCode; // No package declaration — skip

    const pkgEnd = javaCode.indexOf(pkgMatch[0]) + pkgMatch[0].length;

    // Collect existing imports to avoid duplicates
    const existingImports = new Set(
      (javaCode.match(/^import .+;$/gm) ?? []).map(i => i.trim())
    );

    const newImports = imports
      .filter(imp => !existingImports.has(imp))
      .join("\n");

    if (!newImports) return javaCode;

    const header = javaCode.substring(0, pkgEnd);
    const body = javaCode.substring(pkgEnd);

    // Check if there are already imports right after package
    if (body.trimStart().startsWith("import ")) {
      // Insert new imports before existing ones
      const firstImportPos = body.indexOf("import ");
      return header + body.substring(0, firstImportPos) + newImports + "\n" + body.substring(firstImportPos);
    }

    // Insert after package with a blank line
    return header + "\n\n" + newImports + "\n" + body;
  }
}
