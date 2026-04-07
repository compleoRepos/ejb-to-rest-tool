package com.bank.tools.generator.engine.constants;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests unitaires pour GeneratorConstants.
 */
class GeneratorConstantsTest {

    @Test
    @DisplayName("DEFAULT_BASE_PACKAGE est defini")
    void basePackageIsDefined() {
        assertNotNull(GeneratorConstants.DEFAULT_BASE_PACKAGE);
        assertTrue(GeneratorConstants.DEFAULT_BASE_PACKAGE.contains("."));
    }

    @Test
    @DisplayName("DEFAULT_BASE_PACKAGE_PATH correspond au package")
    void basePackagePathMatchesPackage() {
        String expected = GeneratorConstants.DEFAULT_BASE_PACKAGE.replace('.', '/');
        assertEquals(expected, GeneratorConstants.DEFAULT_BASE_PACKAGE_PATH);
    }

    @Test
    @DisplayName("JAVA_LANG_TYPES contient String, Integer, Long")
    void javaLangTypesContainsBasics() {
        assertTrue(GeneratorConstants.JAVA_LANG_TYPES.contains("String"));
        assertTrue(GeneratorConstants.JAVA_LANG_TYPES.contains("Integer"));
        assertTrue(GeneratorConstants.JAVA_LANG_TYPES.contains("Long"));
    }

    @Test
    @DisplayName("PRIMITIVE_TYPES contient int, boolean, double")
    void primitiveTypesContainsBasics() {
        assertTrue(GeneratorConstants.PRIMITIVE_TYPES.contains("int"));
        assertTrue(GeneratorConstants.PRIMITIVE_TYPES.contains("boolean"));
        assertTrue(GeneratorConstants.PRIMITIVE_TYPES.contains("double"));
    }

    @Test
    @DisplayName("TYPE_IMPORT_MAP contient BigDecimal, List, LocalDate")
    void typeImportMapContainsExpectedEntries() {
        assertEquals("java.math.BigDecimal", GeneratorConstants.TYPE_IMPORT_MAP.get("BigDecimal"));
        assertEquals("java.util.List", GeneratorConstants.TYPE_IMPORT_MAP.get("List"));
        assertEquals("java.time.LocalDate", GeneratorConstants.TYPE_IMPORT_MAP.get("LocalDate"));
    }

    @Test
    @DisplayName("FRAMEWORK_TYPES contient BaseUseCase et ValueObject")
    void frameworkTypesContainsEaiTypes() {
        assertTrue(GeneratorConstants.FRAMEWORK_TYPES.contains("BaseUseCase"));
        assertTrue(GeneratorConstants.FRAMEWORK_TYPES.contains("ValueObject"));
    }

    @Test
    @DisplayName("LEGACY_FIELDS contient codeRetour et serialVersionUID")
    void legacyFieldsContainsExpected() {
        assertTrue(GeneratorConstants.LEGACY_FIELDS.contains("codeRetour"));
        assertTrue(GeneratorConstants.LEGACY_FIELDS.contains("serialVersionUID"));
    }

    @Test
    @DisplayName("BIAN_ACTION_HTTP_METHOD mappe initiation sur POST")
    void bianActionHttpMethodMapsCorrectly() {
        assertEquals("POST", GeneratorConstants.BIAN_ACTION_HTTP_METHOD.get("initiation"));
        assertEquals("PUT", GeneratorConstants.BIAN_ACTION_HTTP_METHOD.get("update"));
    }

    @Test
    @DisplayName("EXCEPTION_HTTP_PATTERNS contient au moins 5 patterns")
    void exceptionHttpPatternsHasEntries() {
        assertTrue(GeneratorConstants.EXCEPTION_HTTP_PATTERNS.size() >= 5);
    }

    @Test
    @DisplayName("JAVAX_TO_JAKARTA contient les mappings de migration")
    void javaxToJakartaContainsMappings() {
        assertEquals("jakarta.validation", GeneratorConstants.JAVAX_TO_JAKARTA.get("javax.validation"));
        assertEquals("jakarta.persistence", GeneratorConstants.JAVAX_TO_JAKARTA.get("javax.persistence"));
    }

    @Test
    @DisplayName("Les constantes Spring sont definies")
    void springConstantsAreDefined() {
        assertNotNull(GeneratorConstants.IMPORT_RESPONSE_ENTITY);
        assertNotNull(GeneratorConstants.IMPORT_HTTP_STATUS);
        assertNotNull(GeneratorConstants.IMPORT_VALID);
    }

    @Test
    @DisplayName("Les constantes de structure projet sont definies")
    void projectStructureConstantsAreDefined() {
        assertEquals("src/main/java", GeneratorConstants.SRC_MAIN_JAVA);
        assertEquals("pom.xml", GeneratorConstants.POM_XML);
        assertEquals("application.properties", GeneratorConstants.APPLICATION_PROPERTIES);
    }
}
