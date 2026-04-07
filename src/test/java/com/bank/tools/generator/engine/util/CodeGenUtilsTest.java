package com.bank.tools.generator.engine.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("CodeGenUtils — Utilitaires de génération")
class CodeGenUtilsTest {

    @Nested
    @DisplayName("extractBaseType")
    class ExtractBaseType {
        @Test void simple() { assertEquals("String", CodeGenUtils.extractBaseType("String")); }
        @Test void generic() { assertEquals("List", CodeGenUtils.extractBaseType("List<String>")); }
        @Test void nestedGeneric() { assertEquals("Map", CodeGenUtils.extractBaseType("Map<String, List<Integer>>")); }
        @Test void array() { assertEquals("byte", CodeGenUtils.extractBaseType("byte[]")); }
        @Test void nullSafe() { assertEquals("", CodeGenUtils.extractBaseType(null)); }
    }

    @Nested
    @DisplayName("isDtoType")
    class IsDtoType {
        @ParameterizedTest
        @ValueSource(strings = {"ActiverCarteVoIn", "ActiverCarteVoOut", "CarteDto", "ActivationCarteRequest", "ActivationCarteResponse"})
        void shouldRecognizeDtoTypes(String type) { assertTrue(CodeGenUtils.isDtoType(type)); }

        @ParameterizedTest
        @ValueSource(strings = {"String", "BigDecimal", "StatutCarte", "AuthenticationService"})
        void shouldRejectNonDtoTypes(String type) { assertFalse(CodeGenUtils.isDtoType(type)); }
    }

    @Nested
    @DisplayName("isFrameworkType")
    class IsFrameworkType {
        @ParameterizedTest
        @ValueSource(strings = {"Envelope", "EaiLog", "SynchroneService", "FwkRollbackException", "BaseUseCase", "ValueObject"})
        void shouldRecognizeFrameworkTypes(String type) { assertTrue(CodeGenUtils.isFrameworkType(type)); }

        @ParameterizedTest
        @ValueSource(strings = {"String", "CarteDto", "ActiverCarteUC", "CompteService"})
        void shouldRejectNonFrameworkTypes(String type) { assertFalse(CodeGenUtils.isFrameworkType(type)); }
    }

    @Nested
    @DisplayName("toKebabCase")
    class ToKebabCase {
        @ParameterizedTest
        @CsvSource({
            "activerCarte, activer-carte",
            "chargerClientData, charger-client-data",
            "consulterSolde, consulter-solde",
            "simple, simple"
        })
        void shouldConvertToKebabCase(String input, String expected) {
            assertEquals(expected, CodeGenUtils.toKebabCase(input));
        }
    }

    @Nested
    @DisplayName("resolveExceptionHttpStatus")
    class ExceptionHttpStatus {
        @ParameterizedTest
        @CsvSource({
            "ClientInexistantException, HttpStatus.NOT_FOUND",
            "CarteInexistanteException, HttpStatus.NOT_FOUND",
            "AuthentificationException, HttpStatus.UNAUTHORIZED",
            "CarteDejaActiveException, HttpStatus.CONFLICT",
            "SoldeInsuffisantException, HttpStatus.UNPROCESSABLE_ENTITY",
            "FwkRollbackException, HttpStatus.CONFLICT",
            "CompteBloqueException, HttpStatus.CONFLICT",
            "DocumentNonDisponibleException, HttpStatus.SERVICE_UNAVAILABLE",
            "RandomUnknownException, HttpStatus.INTERNAL_SERVER_ERROR"
        })
        void shouldMapExceptionToCorrectHttpStatus(String exceptionName, String expectedStatus) {
            assertEquals(expectedStatus, CodeGenUtils.resolveExceptionHttpStatus(exceptionName));
        }
    }

    @Nested
    @DisplayName("BIAN helpers")
    class BianHelpers {
        @Test void initiationIsPost() { assertEquals("POST", CodeGenUtils.getBianHttpMethod("initiation")); }
        @Test void controlIsPut() { assertEquals("PUT", CodeGenUtils.getBianHttpMethod("control")); }
        @Test void updateIsPut() { assertEquals("PUT", CodeGenUtils.getBianHttpMethod("update")); }
        @Test void terminationIsPut() { assertEquals("PUT", CodeGenUtils.getBianHttpMethod("termination")); }

        @Test void initiationHasNoCrId() { assertFalse(CodeGenUtils.bianActionRequiresCrId("initiation")); }
        @Test void evaluationHasNoCrId() { assertFalse(CodeGenUtils.bianActionRequiresCrId("evaluation")); }
        @Test void retrievalHasCrId() { assertTrue(CodeGenUtils.bianActionRequiresCrId("retrieval")); }
        @Test void controlHasCrId() { assertTrue(CodeGenUtils.bianActionRequiresCrId("control")); }

        @Test void initiationIs201() { assertEquals("201", CodeGenUtils.getBianSuccessStatus("initiation")); }
        @Test void retrievalIs200() { assertEquals("200", CodeGenUtils.getBianSuccessStatus("retrieval")); }
    }

    @Nested
    @DisplayName("resolveTypeImports")
    class ResolveTypeImports {
        @Test void resolveBigDecimal() {
            Set<String> imports = new HashSet<>();
            CodeGenUtils.resolveTypeImports("BigDecimal", imports);
            assertTrue(imports.contains("java.math.BigDecimal"));
        }

        @Test void resolveListOfString() {
            Set<String> imports = new HashSet<>();
            CodeGenUtils.resolveTypeImports("List<String>", imports);
            assertTrue(imports.contains("java.util.List"));
        }

        @Test void resolveMapNested() {
            Set<String> imports = new HashSet<>();
            CodeGenUtils.resolveTypeImports("Map<String, List<BigDecimal>>", imports);
            assertTrue(imports.contains("java.util.Map"));
            assertTrue(imports.contains("java.util.List"));
            assertTrue(imports.contains("java.math.BigDecimal"));
        }
    }

    @Nested
    @DisplayName("Validation & sanitization")
    class Validation {
        @ParameterizedTest
        @ValueSource(strings = {"ActiverCarteUC", "myField", "_private", "$special"})
        void validIdentifiers(String name) { assertTrue(CodeGenUtils.isValidJavaIdentifier(name)); }

        @ParameterizedTest
        @ValueSource(strings = {"123invalid", "has space", "has-dash", ""})
        void invalidIdentifiers(String name) { assertFalse(CodeGenUtils.isValidJavaIdentifier(name)); }

        @Test void sanitize() {
            assertEquals("hello_world", CodeGenUtils.sanitizeJavaIdentifier("hello-world"));
            assertEquals("_123", CodeGenUtils.sanitizeJavaIdentifier("123"));
        }
    }
}
