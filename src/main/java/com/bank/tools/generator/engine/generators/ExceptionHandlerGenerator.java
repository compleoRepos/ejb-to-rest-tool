package com.bank.tools.generator.engine.generators;

import com.bank.tools.generator.engine.util.CodeGenUtils;
import com.bank.tools.generator.model.ProjectAnalysisResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Génère le GlobalExceptionHandler, le LoggingAspect,
 * et les filtres (CorrelationId, BIAN).
 */
@Component
public class ExceptionHandlerGenerator {

    private static final Logger log = LoggerFactory.getLogger(ExceptionHandlerGenerator.class);

    public void generateGlobalExceptionHandler(Path srcMain, ProjectAnalysisResult analysis, String basePackage) throws IOException {
        StringBuilder customHandlers = new StringBuilder();

        if (analysis != null && analysis.getDetectedExceptions() != null) {
            for (var exc : analysis.getDetectedExceptions()) {
                String name = exc.getName();
                String httpStatus = CodeGenUtils.resolveExceptionHttpStatus(name);

                customHandlers.append("\n    @ExceptionHandler(").append(name).append(".class)\n");
                customHandlers.append("    public ResponseEntity<Map<String, Object>> handle").append(name).append("(").append(name).append(" ex) {\n");
                customHandlers.append("        log.warn(\"").append(name).append(" : {}\", ex.getMessage());\n");
                customHandlers.append("        return buildErrorResponse(").append(httpStatus).append(", ex.getMessage());\n");
                customHandlers.append("    }\n");
            }
        }

        String code = """
                package %s.exception;
                
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ControllerAdvice;
                import org.springframework.web.bind.annotation.ExceptionHandler;
                
                import java.time.LocalDateTime;
                import java.util.LinkedHashMap;
                import java.util.Map;
                import java.util.stream.Collectors;
                
                @ControllerAdvice
                public class GlobalExceptionHandler {
                
                    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
                
                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
                        String errors = ex.getBindingResult().getFieldErrors().stream()
                                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                                .collect(Collectors.joining(", "));
                        return buildErrorResponse(HttpStatus.BAD_REQUEST, errors);
                    }
                
                    @ExceptionHandler(RuntimeException.class)
                    public ResponseEntity<Map<String, Object>> handleRuntime(RuntimeException ex) {
                        String msg = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
                        if (msg.contains("not found") || msg.contains("inexistant") || msg.contains("introuvable"))
                            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage());
                        if (msg.contains("already") || msg.contains("deja") || msg.contains("conflict"))
                            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage());
                        if (msg.contains("insufficient") || msg.contains("insuffisant"))
                            return buildErrorResponse(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
                        if (msg.contains("unauthorized") || msg.contains("authentification"))
                            return buildErrorResponse(HttpStatus.UNAUTHORIZED, ex.getMessage());
                        log.error("Erreur runtime", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
                    }
                
                    @ExceptionHandler(Exception.class)
                    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
                        if (ex.getClass().getName().contains("NamingException")) {
                            return buildErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, "Service EJB indisponible");
                        }
                        if (ex.getClass().getSimpleName().contains("FwkRollback")) {
                            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage());
                        }
                        log.error("Erreur inattendue", ex);
                        return buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne du serveur");
                    }
                
                    %s
                
                    private ResponseEntity<Map<String, Object>> buildErrorResponse(HttpStatus status, String message) {
                        Map<String, Object> body = new LinkedHashMap<>();
                        body.put("timestamp", LocalDateTime.now().toString());
                        body.put("status", status.value());
                        body.put("error", status.getReasonPhrase());
                        body.put("message", message);
                        return new ResponseEntity<>(body, status);
                    }
                }
                """.formatted(basePackage, customHandlers.toString());

        Files.writeString(srcMain.resolve("exception/GlobalExceptionHandler.java"), code);
        log.info("GlobalExceptionHandler généré ({} handlers custom)", analysis.getDetectedExceptions().size());
    }

    public void generateLoggingAspect(Path srcMain, String basePackage) throws IOException {
        String code = """
                package %s.logging;
                
                import org.aspectj.lang.ProceedingJoinPoint;
                import org.aspectj.lang.annotation.Around;
                import org.aspectj.lang.annotation.Aspect;
                import org.slf4j.Logger;
                import org.slf4j.LoggerFactory;
                import org.springframework.stereotype.Component;
                
                @Aspect
                @Component
                public class LoggingAspect {
                
                    private static final Logger log = LoggerFactory.getLogger(LoggingAspect.class);
                
                    @Around("execution(* %s.controller..*(..))")
                    public Object logControllerCalls(ProceedingJoinPoint jp) throws Throwable {
                        String method = jp.getSignature().toShortString();
                        long start = System.currentTimeMillis();
                        try {
                            Object result = jp.proceed();
                            log.info("<< {} ({}ms)", method, System.currentTimeMillis() - start);
                            return result;
                        } catch (Throwable ex) {
                            log.error("!! {} ({}ms) - {}", method, System.currentTimeMillis() - start, ex.getMessage());
                            throw ex;
                        }
                    }
                }
                """.formatted(basePackage, basePackage);

        Files.writeString(srcMain.resolve("logging/LoggingAspect.java"), code);
    }

    public void generateCorrelationIdFilter(Path srcMain, String basePackage) throws IOException {
        String code = """
                package %s.filter;
                
                import jakarta.servlet.*;
                import jakarta.servlet.http.HttpServletRequest;
                import jakarta.servlet.http.HttpServletResponse;
                import org.slf4j.MDC;
                import org.springframework.core.annotation.Order;
                import org.springframework.stereotype.Component;
                
                import java.io.IOException;
                import java.util.UUID;
                
                @Component
                @Order(0)
                public class CorrelationIdFilter implements Filter {
                
                    private static final String HEADER = "X-Correlation-ID";
                
                    @Override
                    public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain) throws IOException, ServletException {
                        HttpServletRequest httpReq = (HttpServletRequest) req;
                        HttpServletResponse httpResp = (HttpServletResponse) resp;
                
                        String correlationId = httpReq.getHeader(HEADER);
                        if (correlationId == null || correlationId.isBlank()) {
                            correlationId = UUID.randomUUID().toString();
                        }
                
                        MDC.put("correlationId", correlationId);
                        httpResp.setHeader(HEADER, correlationId);
                
                        try {
                            chain.doFilter(req, resp);
                        } finally {
                            MDC.remove("correlationId");
                        }
                    }
                }
                """.formatted(basePackage);

        Files.createDirectories(srcMain.resolve("filter"));
        Files.writeString(srcMain.resolve("filter/CorrelationIdFilter.java"), code);
    }
}
