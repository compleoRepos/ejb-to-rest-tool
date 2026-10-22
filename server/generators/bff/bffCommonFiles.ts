/**
 * Fichiers communs de la couche API, identiques dans chaque dépôt de domaine.
 * Source : sortie de référence validée. `<P>` est remplacé par le préfixe de module du dépôt.
 */
export const BFF_COMMON_FILES: Record<string, string> = {
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Echec d'un appel vers un service expose, porteur du code retour rendu par ce service.
 */
public abstract class UpstreamException extends DomainException {

    private final String service;
    private final String code;

    protected UpstreamException(String service, String code, String message) {
        super(message);
        this.service = service;
        this.code = code;
    }

    protected UpstreamException(String service, String code, String message, Throwable cause) {
        super(message, cause);
        this.service = service;
        this.code = code;
    }

    public String getService() {
        return service;
    }

    public String getCode() {
        return code;
    }
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamBusinessException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Refus metier rendu par un service expose, jamais rejoue.
 */
public class UpstreamBusinessException extends UpstreamException {

    public UpstreamBusinessException(String service, String code, String message) {
        super(service, code, message);
    }
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamValidationException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Requete refusee par un service expose pour un motif de format ou de controle de saisie.
 */
public class UpstreamValidationException extends UpstreamException {

    public UpstreamValidationException(String service, String code, String message) {
        super(service, code, message);
    }
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamTechnicalException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Incident technique rendu par un service expose.
 */
public class UpstreamTechnicalException extends UpstreamException {

    public UpstreamTechnicalException(String service, String code, String message) {
        super(service, code, message);
    }

    public UpstreamTechnicalException(String service, String code, String message, Throwable cause) {
        super(service, code, message, cause);
    }
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/IdempotencyKeyFormatException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Cle d'idempotence absente ou hors du format accepte par le stockage des traces.
 */
public class IdempotencyKeyFormatException extends DomainException {

    public IdempotencyKeyFormatException(String message) {
        super(message);
    }
}
`,
  "<P>-domain/<P>-application-service/src/main/java/ma/eai/msiboa/api/domain/idempotency/model/OperationIdempotencyRecord.java": `package ma.eai.msiboa.api.domain.idempotency.model;

import java.time.ZonedDateTime;

import lombok.Builder;

/**
 * Trace d'une operation non sure, avec la reponse ou le refus rendu, pour rejouer le meme resultat.
 */
@Builder(toBuilder = true)
public record OperationIdempotencyRecord(
        String idempotencyKey,
        String service,
        String operation,
        String requestHash,
        IdempotencyStatus status,
        String code,
        String message,
        String responseBody,
        ZonedDateTime createdAt,
        ZonedDateTime expiresAt
) {}
`,
  "<P>-domain/<P>-application-service/src/main/java/ma/eai/msiboa/api/domain/ports/output/repository/OperationIdempotencyStore.java": `package ma.eai.msiboa.api.domain.ports.output.repository;

import java.util.Optional;

import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;

/**
 * Stockage des traces d'idempotence des operations non sures.
 */
public interface OperationIdempotencyStore {

    Optional<OperationIdempotencyRecord> find(String idempotencyKey);

    boolean createIfAbsent(OperationIdempotencyRecord record);

    void save(OperationIdempotencyRecord record);
}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/error/UpstreamApiError.java": `package ma.eai.msiboa.api.application.error;

import java.time.Instant;

/**
 * Erreur rendue au canal quand un service expose refuse ou echoue, avec le code retour d'origine.
 */
public record UpstreamApiError(
        Instant timestamp,
        int status,
        String error,
        String code,
        String message,
        String path,
        String correlationId
) {}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/error/UpstreamExceptionHandler.java": `package ma.eai.msiboa.api.application.error;

import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;
import ma.eai.idev.fwk.logging.EaiLog;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamException;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Traduction des echecs des services exposes en reponses HTTP distinguant refus metier et incident.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class UpstreamExceptionHandler {

    private static final String TECHNICAL_MESSAGE = "Service momentanement indisponible";

    @Value("\${rest.client.correlation-header-name}")
    private String correlationHeaderName;

    @Value("\${neobank.upstream.business-error-status:422}")
    private int businessErrorStatus;

    @ExceptionHandler(UpstreamBusinessException.class)
    public ResponseEntity<UpstreamApiError> handleBusiness(UpstreamBusinessException ex, HttpServletRequest request) {
        return build(HttpStatus.valueOf(businessErrorStatus), ex, ex.getMessage(), request);
    }

    @ExceptionHandler(UpstreamValidationException.class)
    public ResponseEntity<UpstreamApiError> handleValidation(UpstreamValidationException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex, ex.getMessage(), request);
    }

    @ExceptionHandler(UpstreamTechnicalException.class)
    public ResponseEntity<UpstreamApiError> handleTechnical(UpstreamTechnicalException ex, HttpServletRequest request) {
        EaiLog.error("Upstream technical error from " + ex.getService()
                + " code=" + ex.getCode()
                + " during " + request.getMethod() + " " + request.getRequestURI()
                + " (corrId=" + MDC.get(correlationHeaderName) + ")", ex);
        return build(HttpStatus.BAD_GATEWAY, ex, TECHNICAL_MESSAGE, request);
    }

    @ExceptionHandler(IdempotencyKeyFormatException.class)
    public ResponseEntity<UpstreamApiError> handleIdempotencyKey(IdempotencyKeyFormatException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, null, ex.getMessage(), request);
    }

    private ResponseEntity<UpstreamApiError> build(HttpStatus status,
                                                   UpstreamException ex,
                                                   String message,
                                                   HttpServletRequest request) {
        return respond(status, ex.getCode(), message, request);
    }

    private ResponseEntity<UpstreamApiError> respond(HttpStatus status,
                                                     String code,
                                                     String message,
                                                     HttpServletRequest request) {
        UpstreamApiError error = new UpstreamApiError(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                code,
                message,
                request.getRequestURI(),
                MDC.get(correlationHeaderName)
        );
        return ResponseEntity.status(status).body(error);
    }
}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/idempotency/OperationIdempotencyService.java": `package ma.eai.msiboa.api.application.idempotency;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.HexFormat;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import ma.eai.msiboa.api.domain.exception.IdempotencyConflictException;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.idempotency.model.IdempotencyStatus;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Execution unique d'une operation non sure par cle d'idempotence, avec rejeu du resultat d'origine.
 */
@Component
public class OperationIdempotencyService {

    /**
     * Format accepte par Data Grid pour une cle de 128 caracteres au plus, prefixe de stockage compris.
     */
    public static final Pattern KEY_FORMAT = Pattern.compile("[A-Za-z0-9._:@-]{1,118}");

    private final OperationIdempotencyStore store;
    private final ObjectMapper objectMapper;
    private final long ttlSeconds;

    public OperationIdempotencyService(OperationIdempotencyStore store,
                                       ObjectMapper objectMapper,
                                       @Value("\${idempotency.ttl-seconds}") long ttlSeconds) {
        this.store = store;
        this.objectMapper = objectMapper;
        this.ttlSeconds = ttlSeconds;
    }

    public JsonNode execute(String idempotencyKey,
                            String service,
                            String operation,
                            Object request,
                            Supplier<JsonNode> call) {
        if (idempotencyKey == null || !KEY_FORMAT.matcher(idempotencyKey).matches()) {
            throw new IdempotencyKeyFormatException("Idempotency-Key is missing or invalid");
        }
        String requestHash = hash(service + "." + operation, request);
        var existing = store.find(idempotencyKey);
        if (existing.isPresent()) {
            return replay(existing.get(), requestHash);
        }

        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        OperationIdempotencyRecord record = OperationIdempotencyRecord.builder()
                .idempotencyKey(idempotencyKey)
                .service(service)
                .operation(operation)
                .requestHash(requestHash)
                .status(IdempotencyStatus.IN_PROGRESS)
                .createdAt(now)
                .expiresAt(now.plusSeconds(ttlSeconds))
                .build();
        if (!store.createIfAbsent(record)) {
            return replay(store.find(idempotencyKey)
                    .orElseThrow(() -> new IdempotencyConflictException("Idempotency-Key could not be registered")),
                    requestHash);
        }

        try {
            JsonNode response = call.get();
            store.save(record.toBuilder()
                    .status(IdempotencyStatus.COMPLETED)
                    .responseBody(objectMapper.writeValueAsString(response))
                    .build());
            return response;
        } catch (UpstreamBusinessException ex) {
            store.save(record.toBuilder()
                    .status(IdempotencyStatus.COMPLETED)
                    .code(ex.getCode())
                    .message(ex.getMessage())
                    .build());
            throw ex;
        } catch (RuntimeException ex) {
            store.save(record.toBuilder()
                    .status(IdempotencyStatus.FAILED)
                    .message(ex.getMessage())
                    .build());
            throw ex;
        }
    }

    private JsonNode replay(OperationIdempotencyRecord record, String requestHash) {
        if (!record.requestHash().equals(requestHash)) {
            throw new IdempotencyConflictException("Idempotency-Key reuse with different payload");
        }
        if (record.status() == IdempotencyStatus.IN_PROGRESS) {
            throw new IdempotencyConflictException("Request already in progress for this Idempotency-Key");
        }
        if (record.status() == IdempotencyStatus.FAILED) {
            throw new IdempotencyConflictException("Previous request failed for this Idempotency-Key");
        }
        if (record.responseBody() == null) {
            throw new UpstreamBusinessException(record.service(), record.code(), record.message());
        }
        return objectMapper.readTree(record.responseBody());
    }

    private String hash(String operation, Object request) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String payload = operation + "|" + objectMapper.writeValueAsString(request);
            return HexFormat.of().formatHex(digest.digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("Unable to compute request hash", ex);
        }
    }
}
`,
  "<P>-application/src/test/java/ma/eai/msiboa/api/application/idempotency/OperationIdempotencyServiceTest.java": `package ma.eai.msiboa.api.application.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import ma.eai.msiboa.api.domain.exception.IdempotencyConflictException;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OperationIdempotencyServiceTest {

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final AtomicInteger calls = new AtomicInteger();
    private OperationIdempotencyService service;

    @BeforeEach
    void setUp() {
        service = new OperationIdempotencyService(new InMemoryStore(), mapper, 3600);
    }

    @Test
    void sameKeyAndPayloadReturnsStoredResponseWithoutCallingAgain() {
        JsonNode first = service.execute("k1", "svc", "op", Map.of("a", "1"), this::success);
        JsonNode second = service.execute("k1", "svc", "op", Map.of("a", "1"), this::success);

        assertThat(second).isEqualTo(first);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void sameKeyWithDifferentPayloadIsRejected() {
        service.execute("k2", "svc", "op", Map.of("a", "1"), this::success);

        assertThatThrownBy(() -> service.execute("k2", "svc", "op", Map.of("a", "2"), this::success))
                .isInstanceOf(IdempotencyConflictException.class);
    }

    @Test
    void businessRefusalIsReplayedWithoutCallingAgain() {
        assertThatThrownBy(() -> service.execute("k3", "svc", "op", Map.of(), this::refusal))
                .isInstanceOf(UpstreamBusinessException.class);
        assertThatThrownBy(() -> service.execute("k3", "svc", "op", Map.of(), this::success))
                .isInstanceOf(UpstreamBusinessException.class)
                .hasMessage("Solde insuffisant");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void technicalFailureBlocksTheKey() {
        assertThatThrownBy(() -> service.execute("k4", "svc", "op", Map.of(), this::failure))
                .isInstanceOf(UpstreamTechnicalException.class);
        assertThatThrownBy(() -> service.execute("k4", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class);
    }

    @Test
    void missingKeyIsRejectedWithoutCallingTheService() {
        assertThatThrownBy(() -> service.execute(null, "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyKeyFormatException.class);
        assertThat(calls.get()).isZero();
    }

    @Test
    void keyWithForbiddenCharacterIsRejectedWithoutCallingTheService() {
        assertThatThrownBy(() -> service.execute("k 5", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyKeyFormatException.class);
        assertThatThrownBy(() -> service.execute("k/5", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyKeyFormatException.class);
        assertThat(calls.get()).isZero();
    }

    @Test
    void keyLongerThanStorageLimitIsRejected() {
        assertThatThrownBy(() -> service.execute("a".repeat(119), "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyKeyFormatException.class);
        assertThat(calls.get()).isZero();
    }

    @Test
    void longestAcceptedKeyIsExecuted() {
        service.execute("a".repeat(118), "svc", "op", Map.of(), this::success);

        assertThat(calls.get()).isEqualTo(1);
    }

    private JsonNode success() {
        calls.incrementAndGet();
        return mapper.readTree("{\\"CODRET\\":\\"000\\"}");
    }

    private JsonNode refusal() {
        calls.incrementAndGet();
        throw new UpstreamBusinessException("svc", "001", "Solde insuffisant");
    }

    private JsonNode failure() {
        calls.incrementAndGet();
        throw new UpstreamTechnicalException("svc", "004", "Probleme technique");
    }

    private static final class InMemoryStore implements OperationIdempotencyStore {

        private final Map<String, OperationIdempotencyRecord> records = new HashMap<>();

        @Override
        public Optional<OperationIdempotencyRecord> find(String idempotencyKey) {
            return Optional.ofNullable(records.get(idempotencyKey));
        }

        @Override
        public boolean createIfAbsent(OperationIdempotencyRecord record) {
            return records.putIfAbsent(record.idempotencyKey(), record) == null;
        }

        @Override
        public void save(OperationIdempotencyRecord record) {
            records.put(record.idempotencyKey(), record);
        }
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamRestClients.java": `package ma.eai.msiboa.api.integration.upstream;

import java.time.Duration;

import io.github.resilience4j.bulkhead.BulkheadRegistry;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.RetryRegistry;
import ma.eai.msiboa.api.integration.CorrelationIdInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Fabrique des clients HTTP vers les services exposes, un disjoncteur nomme par service.
 */
@Component
public class UpstreamRestClients {

    private final CorrelationIdInterceptor correlationIdInterceptor;
    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final RetryRegistry retryRegistry;
    private final BulkheadRegistry bulkheadRegistry;
    private final long connectTimeoutSeconds;
    private final long readTimeoutSeconds;

    public UpstreamRestClients(CorrelationIdInterceptor correlationIdInterceptor,
                               CircuitBreakerRegistry circuitBreakerRegistry,
                               RetryRegistry retryRegistry,
                               BulkheadRegistry bulkheadRegistry,
                               @Value("\${rest.client.connect-timeout-seconds}") long connectTimeoutSeconds,
                               @Value("\${rest.client.read-timeout-seconds}") long readTimeoutSeconds) {
        this.correlationIdInterceptor = correlationIdInterceptor;
        this.circuitBreakerRegistry = circuitBreakerRegistry;
        this.retryRegistry = retryRegistry;
        this.bulkheadRegistry = bulkheadRegistry;
        this.connectTimeoutSeconds = connectTimeoutSeconds;
        this.readTimeoutSeconds = readTimeoutSeconds;
    }

    public RestClient build(String service, String baseUrl) {
        return builder(service, baseUrl).build();
    }

    public RestClient.Builder builder(String service, String baseUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(connectTimeoutSeconds));
        requestFactory.setReadTimeout(Duration.ofSeconds(readTimeoutSeconds));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .requestInterceptor(correlationIdInterceptor)
                .requestInterceptor(new UpstreamResilienceInterceptor(
                        circuitBreakerRegistry.circuitBreaker(service),
                        retryRegistry.retry(service),
                        bulkheadRegistry.bulkhead(service)));
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamResilienceInterceptor.java": `package ma.eai.msiboa.api.integration.upstream;

import java.io.IOException;
import java.util.concurrent.Callable;

import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

/**
 * Disjoncteur et limite de concurrence propres a un service expose, rejeu reserve aux lectures.
 */
public class UpstreamResilienceInterceptor implements ClientHttpRequestInterceptor {

    private final CircuitBreaker circuitBreaker;
    private final Retry retry;
    private final Bulkhead bulkhead;

    public UpstreamResilienceInterceptor(CircuitBreaker circuitBreaker, Retry retry, Bulkhead bulkhead) {
        this.circuitBreaker = circuitBreaker;
        this.retry = retry;
        this.bulkhead = bulkhead;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request,
                                        byte[] body,
                                        ClientHttpRequestExecution execution) throws IOException {
        Callable<ClientHttpResponse> call = CircuitBreaker.decorateCallable(circuitBreaker,
                () -> execution.execute(request, body));
        if (HttpMethod.GET.equals(request.getMethod())) {
            call = Retry.decorateCallable(retry, call);
        }
        try {
            return Bulkhead.decorateCallable(bulkhead, call).call();
        } catch (CallNotPermittedException | BulkheadFullException ex) {
            throw ex;
        } catch (IOException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IOException("Outbound HTTP call failed", ex);
        }
    }
}
`,
  "<P>-container/src/test/java/ma/eai/msiboa/api/integration/upstream/UpstreamResilienceInterceptorTest.java": `package ma.eai.msiboa.api.integration.upstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.mock.http.client.MockClientHttpRequest;

class UpstreamResilienceInterceptorTest {

    private final AtomicInteger attempts = new AtomicInteger();

    private final ClientHttpRequestExecution failing = (request, body) -> {
        attempts.incrementAndGet();
        throw new IOException("Read timed out");
    };

    private UpstreamResilienceInterceptor interceptor() {
        Retry retry = Retry.of("test", RetryConfig.custom()
                .maxAttempts(3)
                .waitDuration(Duration.ofMillis(1))
                .retryExceptions(IOException.class)
                .build());
        return new UpstreamResilienceInterceptor(CircuitBreaker.ofDefaults("test"), retry, Bulkhead.ofDefaults("test"));
    }

    @Test
    void readIsRetried() {
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.GET, URI.create("http://h/api/x"));

        assertThatThrownBy(() -> interceptor().intercept(request, new byte[0], failing))
                .isInstanceOf(IOException.class);
        assertThat(attempts.get()).isEqualTo(3);
    }

    @Test
    void writeIsNeverRetried() {
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.POST, URI.create("http://h/api/x"));

        assertThatThrownBy(() -> interceptor().intercept(request, new byte[0], failing))
                .isInstanceOf(IOException.class);
        assertThat(attempts.get()).isEqualTo(1);
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamErrorDecoder.java": `package ma.eai.msiboa.api.integration.upstream;

import java.io.IOException;

import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpResponse;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Lecture du corps d'erreur d'un service expose et classement par code retour, le statut HTTP de l'aval n'etant pas fiable.
 */
public class UpstreamErrorDecoder {

    private final String service;
    private final UpstreamReturnCodes returnCodes;
    private final ObjectMapper objectMapper;

    public UpstreamErrorDecoder(String service, UpstreamReturnCodes returnCodes, ObjectMapper objectMapper) {
        this.service = service;
        this.returnCodes = returnCodes;
        this.objectMapper = objectMapper;
    }

    public void handle(HttpRequest request, ClientHttpResponse response) throws IOException {
        int status = response.getStatusCode().value();
        String code = String.valueOf(status);
        String message = null;
        try {
            JsonNode body = objectMapper.readTree(response.getBody());
            if (body != null && body.hasNonNull("code")) {
                code = body.get("code").asString();
            }
            if (body != null && body.hasNonNull("message")) {
                message = body.get("message").asString();
            }
        } catch (JacksonException ex) {
            message = null;
        }

        if (returnCodes.business().contains(code)) {
            throw new UpstreamBusinessException(service, code, message);
        }
        if (returnCodes.validation().contains(code) || status == 400) {
            throw new UpstreamValidationException(service, code, message);
        }
        throw new UpstreamTechnicalException(service, code, message);
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamReturnCodes.java": `package ma.eai.msiboa.api.integration.upstream;

import java.util.Collection;
import java.util.Set;

/**
 * Classement des codes retour d'un service expose entre refus metier et erreur de saisie.
 */
public record UpstreamReturnCodes(Set<String> business, Set<String> validation) {

    public static UpstreamReturnCodes of(Collection<String> business, Collection<String> validation) {
        return new UpstreamReturnCodes(Set.copyOf(business), Set.copyOf(validation));
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/infrastructure/idempotency/DataGridOperationIdempotencyStore.java": `package ma.eai.msiboa.api.infrastructure.idempotency;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import ma.eai.idev.fwk.logging.EaiLog;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import ma.eai.msiboa.idev.datagrid.service.DataGridService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Traces d'idempotence des operations non sures conservees dans Data Grid.
 */
@Component
@ConditionalOnProperty(name = "idempotency.storage", havingValue = "datagrid", matchIfMissing = true)
public class DataGridOperationIdempotencyStore implements OperationIdempotencyStore {

    private static final String KEY_PREFIX = "operation:";

    private final DataGridService dataGrid;
    private final ObjectMapper objectMapper;
    private final String cacheName;

    public DataGridOperationIdempotencyStore(DataGridService dataGrid,
                                             ObjectMapper objectMapper,
                                             @Value("\${idempotency.cache-name}") String cacheName) {
        this.dataGrid = dataGrid;
        this.objectMapper = objectMapper;
        this.cacheName = cacheName;
    }

    @Override
    public Optional<OperationIdempotencyRecord> find(String idempotencyKey) {
        try {
            return dataGrid.get(cacheName, KEY_PREFIX + idempotencyKey)
                    .map(payload -> objectMapper.readValue(payload, OperationIdempotencyRecord.class));
        } catch (Exception e) {
            EaiLog.error("Could not read operation idempotency entry " + idempotencyKey, e);
            throw new IllegalStateException("Could not read operation idempotency entry", e);
        }
    }

    @Override
    public boolean createIfAbsent(OperationIdempotencyRecord record) {
        String key = KEY_PREFIX + record.idempotencyKey();
        String payload = objectMapper.writeValueAsString(record);
        try {
            return dataGrid.putIfAbsent(cacheName, key, payload, ttlSeconds(record));
        } catch (Exception e) {
            EaiLog.error("Could not create operation idempotency entry " + record.idempotencyKey(), e);
            throw new IllegalStateException("Could not create operation idempotency entry", e);
        }
    }

    @Override
    public void save(OperationIdempotencyRecord record) {
        String key = KEY_PREFIX + record.idempotencyKey();
        try {
            dataGrid.put(cacheName, key, objectMapper.writeValueAsString(record), ttlSeconds(record));
        } catch (Exception e) {
            EaiLog.error("Could not write operation idempotency entry " + record.idempotencyKey(), e);
            throw new IllegalStateException("Could not write operation idempotency entry", e);
        }
    }

    private int ttlSeconds(OperationIdempotencyRecord record) {
        long seconds = Duration.between(Instant.now(), record.expiresAt().toInstant()).getSeconds();
        return Math.toIntExact(Math.max(1, Math.min(Integer.MAX_VALUE, seconds)));
    }
}
`,
  "<P>-application/src/test/java/ma/eai/msiboa/api/application/error/IdempotencyKeyStatusTest.java": `package ma.eai.msiboa.api.application.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import ma.eai.msiboa.api.application.idempotency.OperationIdempotencyService;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

class IdempotencyKeyStatusTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        JsonMapper mapper = JsonMapper.builder().build();
        OperationIdempotencyService service = new OperationIdempotencyService(new InMemoryStore(), mapper, 3600);
        UpstreamExceptionHandler handler = new UpstreamExceptionHandler();
        ReflectionTestUtils.setField(handler, "correlationHeaderName", "X-Correlation-Id");
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController(service, mapper))
                .setControllerAdvice(handler)
                .build();
    }

    @Test
    void validKeyIsAccepted() throws Exception {
        mockMvc.perform(post("/probe").header("Idempotency-Key", "k-1"))
                .andExpect(status().isOk());
    }

    @Test
    void missingKeyReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/probe"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void keyWithForbiddenCharacterReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/probe").header("Idempotency-Key", "k 1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void keyLongerThanStorageLimitReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/probe").header("Idempotency-Key", "a".repeat(119)))
                .andExpect(status().isBadRequest());
    }

    @RestController
    public static class ProbeController {

        private final OperationIdempotencyService service;
        private final JsonMapper mapper;

        public ProbeController(OperationIdempotencyService service, JsonMapper mapper) {
            this.service = service;
            this.mapper = mapper;
        }

        @PostMapping("/probe")
        public ResponseEntity<String> probe(@RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
            service.execute(idempotencyKey, "svc", "op", Map.of(), mapper::createObjectNode);
            return ResponseEntity.ok("done");
        }
    }

    private static final class InMemoryStore implements OperationIdempotencyStore {

        private final Map<String, OperationIdempotencyRecord> records = new ConcurrentHashMap<>();

        @Override
        public Optional<OperationIdempotencyRecord> find(String idempotencyKey) {
            return Optional.ofNullable(records.get(idempotencyKey));
        }

        @Override
        public boolean createIfAbsent(OperationIdempotencyRecord record) {
            return records.putIfAbsent(record.idempotencyKey(), record) == null;
        }

        @Override
        public void save(OperationIdempotencyRecord record) {
            records.put(record.idempotencyKey(), record);
        }
    }
}
`,
  "<P>-container/src/test/java/ma/eai/msiboa/api/infrastructure/idempotency/DataGridOperationIdempotencyStoreTest.java": `package ma.eai.msiboa.api.infrastructure.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import ma.eai.msiboa.api.application.idempotency.OperationIdempotencyService;
import ma.eai.msiboa.api.domain.exception.IdempotencyConflictException;
import ma.eai.msiboa.api.domain.idempotency.model.IdempotencyStatus;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import ma.eai.msiboa.idev.datagrid.config.DataGridProperties;
import ma.eai.msiboa.idev.datagrid.error.DataGridException;
import ma.eai.msiboa.idev.datagrid.error.DataGridOperation;
import ma.eai.msiboa.idev.datagrid.service.DataGridService;
import ma.eai.msiboa.idev.datagrid.validation.DataGridInputValidator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class DataGridOperationIdempotencyStoreTest {

    private static final String CACHE = "operation-idempotency-cache";

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final DataGridOperationIdempotencyStore store =
            new DataGridOperationIdempotencyStore(new InMemoryDataGrid(), mapper, CACHE);

    @Test
    void secondReservationOfSameKeyIsRefused() {
        assertThat(store.createIfAbsent(record("k-1"))).isTrue();
        assertThat(store.createIfAbsent(record("k-1"))).isFalse();
    }

    @Test
    void twoConcurrentRequestsOnSameKeyExecuteOnce() throws Exception {
        CyclicBarrier bothLookedUp = new CyclicBarrier(2);
        AtomicInteger lookups = new AtomicInteger();
        OperationIdempotencyStore racingStore = new OperationIdempotencyStore() {
            @Override
            public Optional<OperationIdempotencyRecord> find(String idempotencyKey) {
                Optional<OperationIdempotencyRecord> found = store.find(idempotencyKey);
                if (lookups.incrementAndGet() <= 2) {
                    await(bothLookedUp);
                }
                return found;
            }

            @Override
            public boolean createIfAbsent(OperationIdempotencyRecord record) {
                return store.createIfAbsent(record);
            }

            @Override
            public void save(OperationIdempotencyRecord record) {
                store.save(record);
            }
        };
        OperationIdempotencyService service = new OperationIdempotencyService(racingStore, mapper, 3600);
        AtomicInteger calls = new AtomicInteger();
        Callable<Object> request = () -> {
            try {
                return service.execute("k-2", "svc", "op", Map.of("a", "1"), () -> {
                    calls.incrementAndGet();
                    return mapper.createObjectNode();
                });
            } catch (IdempotencyConflictException ex) {
                return ex;
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (Future<Object> result : pool.invokeAll(List.of(request, request))) {
                assertThat(result.get()).isInstanceOfAny(JsonNode.class, IdempotencyConflictException.class);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void longestAcceptedKeyFitsDataGridKeyRules() throws Exception {
        DataGridInputValidator validator = new DataGridInputValidator(new DataGridProperties());
        String longest = "a".repeat(118);

        assertThat(OperationIdempotencyService.KEY_FORMAT.matcher(longest).matches()).isTrue();
        validator.validateKey(CACHE, "operation:" + longest, DataGridOperation.PUT_IF_ABSENT);
        assertThatThrownBy(() -> validator.validateKey(CACHE, "operation:" + longest + "a", DataGridOperation.PUT_IF_ABSENT))
                .isInstanceOf(DataGridException.class);
    }

    private static OperationIdempotencyRecord record(String key) {
        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        return OperationIdempotencyRecord.builder()
                .idempotencyKey(key)
                .service("svc")
                .operation("op")
                .requestHash("hash")
                .status(IdempotencyStatus.IN_PROGRESS)
                .createdAt(now)
                .expiresAt(now.plusSeconds(3600))
                .build();
    }

    private static void await(CyclicBarrier barrier) {
        try {
            barrier.await(5, TimeUnit.SECONDS);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static final class InMemoryDataGrid implements DataGridService {

        private final Map<String, String> entries = new ConcurrentHashMap<>();

        @Override
        public void put(String cacheName, String key, String value, long ttlSeconds) {
            entries.put(cacheName + "/" + key, value);
        }

        @Override
        public boolean putIfAbsent(String cacheName, String key, String value, long ttlSeconds) {
            return entries.putIfAbsent(cacheName + "/" + key, value) == null;
        }

        @Override
        public Optional<String> get(String cacheName, String key) {
            return Optional.ofNullable(entries.get(cacheName + "/" + key));
        }

        @Override
        public boolean replace(String cacheName, String key, String value, long ttlSeconds) {
            return entries.replace(cacheName + "/" + key, value) != null;
        }

        @Override
        public boolean exists(String cacheName, String key) {
            return entries.containsKey(cacheName + "/" + key);
        }

        @Override
        public boolean remove(String cacheName, String key) {
            return entries.remove(cacheName + "/" + key) != null;
        }

        @Override
        public boolean isCacheAvailable(String cacheName) {
            return true;
        }
    }
}
`,
};
