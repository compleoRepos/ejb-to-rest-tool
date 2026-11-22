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
    private final transient UpstreamErrorDetail detail;

    protected UpstreamException(String service, String code, String message) {
        this(service, code, message, UpstreamErrorDetail.NONE);
    }

    protected UpstreamException(String service, String code, String message, UpstreamErrorDetail detail) {
        super(message);
        this.service = service;
        this.code = code;
        this.detail = detail == null ? UpstreamErrorDetail.NONE : detail;
    }

    protected UpstreamException(String service, String code, String message, Throwable cause) {
        super(message, cause);
        this.service = service;
        this.code = code;
        this.detail = UpstreamErrorDetail.NONE;
    }

    public String getService() {
        return service;
    }

    public String getCode() {
        return code;
    }

    public UpstreamErrorDetail getDetail() {
        return detail;
    }
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamErrorDetail.java": `package ma.eai.msiboa.api.domain.exception;

import java.util.Map;

/**
 * Message codifie rendu par un service expose : code du message, parametres et libelle d'origine.
 */
public record UpstreamErrorDetail(String codeMessage, Map<String, Object> parametres, String messageLegacy) {

    public static final UpstreamErrorDetail NONE = new UpstreamErrorDetail(null, null, null);
}
`,
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamChannelException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Appel refuse par un service expose pour son canal, absent ou hors referentiel : l'operation n'a pas ete executee.
 */
public class UpstreamChannelException extends UpstreamException {

    private final int status;

    public UpstreamChannelException(String service, String code, String message, UpstreamErrorDetail detail, int status) {
        super(service, code, message, detail);
        this.status = status;
    }

    public int getStatus() {
        return status;
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

    public UpstreamBusinessException(String service, String code, String message, UpstreamErrorDetail detail) {
        super(service, code, message, detail);
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

    public UpstreamValidationException(String service, String code, String message, UpstreamErrorDetail detail) {
        super(service, code, message, detail);
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
  "<P>-domain/<P>-domain-core/src/main/java/ma/eai/msiboa/api/domain/exception/UpstreamAuthenticationException.java": `package ma.eai.msiboa.api.domain.exception;

/**
 * Appel refuse en 401 par un service expose, l'operation n'a pas ete executee.
 */
public class UpstreamAuthenticationException extends UpstreamTechnicalException {

    public UpstreamAuthenticationException(String service, String code, String message) {
        super(service, code, message);
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
import ma.eai.msiboa.api.domain.exception.UpstreamErrorDetail;

/**
 * Trace d'une operation non sure, avec la reponse ou le refus rendu, pour rejouer le meme resultat.
 */
@Builder(toBuilder = true)
public record OperationIdempotencyRecord(
        String idempotencyKey,
        String service,
        String operation,
        String requestHash,
        OperationIdempotencyStatus status,
        String code,
        String message,
        UpstreamErrorDetail detail,
        boolean inputRefusal,
        String responseBody,
        ZonedDateTime createdAt,
        ZonedDateTime expiresAt
) {}
`,
  "<P>-domain/<P>-application-service/src/main/java/ma/eai/msiboa/api/domain/idempotency/model/OperationIdempotencyStatus.java": `package ma.eai.msiboa.api.domain.idempotency.model;

/**
 * Etat d'une operation non sure : en cours d'execution, terminee avec un resultat connu, ou issue inconnue.
 */
public enum OperationIdempotencyStatus {
    IN_PROGRESS,
    COMPLETED,
    UNKNOWN
}
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

    void delete(String idempotencyKey);
}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/error/UpstreamApiError.java": `package ma.eai.msiboa.api.application.error;

import java.time.Instant;
import java.util.Map;

/**
 * Erreur rendue au canal quand un service expose refuse ou echoue, avec le code retour et le message codifie d'origine.
 */
public record UpstreamApiError(
        Instant timestamp,
        int status,
        String error,
        String code,
        String message,
        String path,
        String correlationId,
        String codeMessage,
        Map<String, Object> parametres,
        String messageLegacy
) {}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/error/UpstreamExceptionHandler.java": `package ma.eai.msiboa.api.application.error;

import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;
import ma.eai.idev.fwk.logging.EaiLog;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamChannelException;
import ma.eai.msiboa.api.domain.exception.UpstreamErrorDetail;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
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
        return respond(HttpStatus.valueOf(businessErrorStatus), ex.getCode(), ex.getMessage(), ex.getDetail(), request);
    }

    @ExceptionHandler(UpstreamValidationException.class)
    public ResponseEntity<UpstreamApiError> handleValidation(UpstreamValidationException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, ex.getCode(), ex.getMessage(), ex.getDetail(), request);
    }

    @ExceptionHandler(UpstreamChannelException.class)
    public ResponseEntity<UpstreamApiError> handleChannel(UpstreamChannelException ex, HttpServletRequest request) {
        return respond(HttpStatus.valueOf(ex.getStatus()), ex.getCode(), ex.getMessage(), ex.getDetail(), request);
    }

    @ExceptionHandler(UpstreamTechnicalException.class)
    public ResponseEntity<UpstreamApiError> handleTechnical(UpstreamTechnicalException ex, HttpServletRequest request) {
        EaiLog.error("Upstream technical error from " + ex.getService()
                + " code=" + ex.getCode()
                + " during " + request.getMethod() + " " + request.getRequestURI()
                + " (corrId=" + MDC.get(correlationHeaderName) + ")", ex);
        return respond(HttpStatus.BAD_GATEWAY, ex.getCode(), TECHNICAL_MESSAGE, UpstreamErrorDetail.NONE, request);
    }

    @ExceptionHandler(IdempotencyKeyFormatException.class)
    public ResponseEntity<UpstreamApiError> handleIdempotencyKey(IdempotencyKeyFormatException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, null, ex.getMessage(), UpstreamErrorDetail.NONE, request);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<UpstreamApiError> handleMissingHeader(MissingRequestHeaderException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, null, ex.getHeaderName() + " is missing or invalid", UpstreamErrorDetail.NONE, request);
    }

    private ResponseEntity<UpstreamApiError> respond(HttpStatus status,
                                                     String code,
                                                     String message,
                                                     UpstreamErrorDetail detail,
                                                     HttpServletRequest request) {
        UpstreamApiError error = new UpstreamApiError(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                code,
                message,
                request.getRequestURI(),
                MDC.get(correlationHeaderName),
                detail.codeMessage(),
                detail.parametres(),
                detail.messageLegacy()
        );
        return ResponseEntity.status(status).body(error);
    }
}
`,
  "<P>-application/src/main/java/ma/eai/msiboa/api/application/idempotency/OperationIdempotencyService.java": `package ma.eai.msiboa.api.application.idempotency;

import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.ZonedDateTime;
import java.util.HexFormat;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import ma.eai.msiboa.api.domain.exception.IdempotencyConflictException;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.idev.fwk.logging.EaiLog;
import ma.eai.msiboa.api.domain.exception.UpstreamAuthenticationException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamChannelException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyStatus;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.springframework.beans.factory.annotation.Autowired;
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

    public static final String IN_PROGRESS_MESSAGE = "Request already in progress for this Idempotency-Key";

    public static final String UNKNOWN_OUTCOME_MESSAGE =
            "Previous request outcome is unknown for this Idempotency-Key, check the operation before retrying with a new key";

    /**
     * Marge ajoutee au delai de lecture avant de tenir pour inconnue l'issue d'une operation encore en cours.
     */
    public static final long IN_PROGRESS_MARGIN_SECONDS = 30;

    private final OperationIdempotencyStore store;
    private final ObjectMapper objectMapper;
    private final long ttlSeconds;
    private final long unknownAfterSeconds;
    private final Clock clock;

    @Autowired
    public OperationIdempotencyService(OperationIdempotencyStore store,
                                       ObjectMapper objectMapper,
                                       @Value("\${idempotency.ttl-seconds}") long ttlSeconds,
                                       @Value("\${rest.client.read-timeout-seconds}") long readTimeoutSeconds) {
        this(store, objectMapper, ttlSeconds, readTimeoutSeconds, Clock.systemUTC());
    }

    OperationIdempotencyService(OperationIdempotencyStore store,
                                ObjectMapper objectMapper,
                                long ttlSeconds,
                                long readTimeoutSeconds,
                                Clock clock) {
        this.store = store;
        this.objectMapper = objectMapper;
        this.ttlSeconds = ttlSeconds;
        this.unknownAfterSeconds = readTimeoutSeconds + IN_PROGRESS_MARGIN_SECONDS;
        this.clock = clock;
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

        ZonedDateTime now = ZonedDateTime.now(clock);
        OperationIdempotencyRecord record = OperationIdempotencyRecord.builder()
                .idempotencyKey(idempotencyKey)
                .service(service)
                .operation(operation)
                .requestHash(requestHash)
                .status(OperationIdempotencyStatus.IN_PROGRESS)
                .createdAt(now)
                .expiresAt(now.plusSeconds(ttlSeconds))
                .build();
        if (!store.createIfAbsent(record)) {
            return replay(store.find(idempotencyKey)
                    .orElseThrow(() -> new IdempotencyConflictException("Idempotency-Key could not be registered")),
                    requestHash);
        }

        JsonNode response;
        try {
            response = call.get();
        } catch (UpstreamBusinessException ex) {
            store.save(retained(record, OperationIdempotencyStatus.COMPLETED)
                    .code(ex.getCode())
                    .message(ex.getMessage())
                    .detail(ex.getDetail())
                    .build());
            throw ex;
        } catch (UpstreamValidationException ex) {
            store.save(retained(record, OperationIdempotencyStatus.COMPLETED)
                    .code(ex.getCode())
                    .message(ex.getMessage())
                    .detail(ex.getDetail())
                    .inputRefusal(true)
                    .build());
            throw ex;
        } catch (RuntimeException ex) {
            if (isNotSent(ex)) {
                store.delete(idempotencyKey);
            } else {
                store.save(retained(record, OperationIdempotencyStatus.UNKNOWN)
                        .message(ex.getMessage())
                        .build());
            }
            throw ex;
        }
        storeCompleted(record, response);
        return response;
    }

    private void storeCompleted(OperationIdempotencyRecord record, JsonNode response) {
        Supplier<OperationIdempotencyRecord> completed = () -> retained(record, OperationIdempotencyStatus.COMPLETED)
                .responseBody(objectMapper.writeValueAsString(response))
                .build();
        if (saveQuietly(completed) || saveQuietly(completed)) {
            return;
        }
        EaiLog.error("Operation result could not be stored, key=" + record.idempotencyKey()
                + " service=" + record.service()
                + " operation=" + record.operation());
        saveQuietly(() -> retained(record, OperationIdempotencyStatus.UNKNOWN)
                .message("Operation result could not be stored")
                .build());
    }

    private boolean saveQuietly(Supplier<OperationIdempotencyRecord> record) {
        try {
            store.save(record.get());
            return true;
        } catch (RuntimeException ex) {
            EaiLog.error("Could not store operation idempotency entry", ex);
            return false;
        }
    }

    private OperationIdempotencyRecord.OperationIdempotencyRecordBuilder retained(OperationIdempotencyRecord record,
                                                                                 OperationIdempotencyStatus status) {
        return record.toBuilder()
                .status(status)
                .expiresAt(ZonedDateTime.now(clock).plusSeconds(ttlSeconds));
    }

    /**
     * Vrai quand l'operation n'a pas pu etre executee : disjoncteur ouvert, limite de concurrence atteinte, connexion impossible, appel refuse en 401 ou pour son canal.
     */
    static boolean isNotSent(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause() == cause ? null : cause.getCause()) {
            if (cause instanceof UpstreamAuthenticationException
                    || cause instanceof UpstreamChannelException
                    || cause instanceof CallNotPermittedException
                    || cause instanceof BulkheadFullException
                    || cause instanceof ConnectException
                    || cause instanceof UnknownHostException
                    || cause instanceof NoRouteToHostException) {
                return true;
            }
        }
        return false;
    }

    private JsonNode replay(OperationIdempotencyRecord record, String requestHash) {
        if (!record.requestHash().equals(requestHash)) {
            throw new IdempotencyConflictException("Idempotency-Key reuse with different payload");
        }
        if (record.status() == OperationIdempotencyStatus.IN_PROGRESS) {
            boolean stale = record.createdAt().plusSeconds(unknownAfterSeconds).isBefore(ZonedDateTime.now(clock));
            throw new IdempotencyConflictException(stale ? UNKNOWN_OUTCOME_MESSAGE : IN_PROGRESS_MESSAGE);
        }
        if (record.status() == OperationIdempotencyStatus.UNKNOWN) {
            throw new IdempotencyConflictException(UNKNOWN_OUTCOME_MESSAGE);
        }
        if (record.responseBody() == null && record.inputRefusal()) {
            throw new UpstreamValidationException(record.service(), record.code(), record.message(), record.detail());
        }
        if (record.responseBody() == null) {
            throw new UpstreamBusinessException(record.service(), record.code(), record.message(), record.detail());
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

import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import ma.eai.msiboa.api.domain.exception.IdempotencyConflictException;
import ma.eai.msiboa.api.domain.exception.IdempotencyKeyFormatException;
import ma.eai.msiboa.api.domain.exception.UpstreamAuthenticationException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyStatus;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OperationIdempotencyServiceTest {

    private static final long TTL_SECONDS = 3600;
    private static final long READ_TIMEOUT_SECONDS = 30;
    private static final long UNKNOWN_AFTER_SECONDS =
            READ_TIMEOUT_SECONDS + OperationIdempotencyService.IN_PROGRESS_MARGIN_SECONDS;

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final AtomicInteger calls = new AtomicInteger();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-02T10:00:00Z"));
    private final InMemoryStore store = new InMemoryStore(clock);
    private OperationIdempotencyService service;

    @BeforeEach
    void setUp() {
        service = new OperationIdempotencyService(store, mapper, TTL_SECONDS, READ_TIMEOUT_SECONDS, clock);
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
    void completedResponseIsKeptForTheFullRetentionFromCompletion() {
        service.execute("k-done", "svc", "op", Map.of(), this::success);

        assertThat(store.records.get("k-done").status()).isEqualTo(OperationIdempotencyStatus.COMPLETED);
        assertThat(store.records.get("k-done").expiresAt().toInstant()).isEqualTo(clock.instant().plusSeconds(TTL_SECONDS));
        clock.advance(UNKNOWN_AFTER_SECONDS + 1);
        service.execute("k-done", "svc", "op", Map.of(), this::success);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void keyInProgressIsRefusedWhileReserved() {
        AtomicReference<Throwable> concurrent = new AtomicReference<>();
        service.execute("k-busy", "svc", "op", Map.of(), () -> {
            assertThat(store.records.get("k-busy").expiresAt().toInstant()).isEqualTo(clock.instant().plusSeconds(TTL_SECONDS));
            try {
                service.execute("k-busy", "svc", "op", Map.of(), this::success);
            } catch (IdempotencyConflictException ex) {
                concurrent.set(ex);
            }
            return success();
        });

        assertThat(concurrent.get()).isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.IN_PROGRESS_MESSAGE);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void reservationLeftByAStoppedServerIsReportedUnknownAfterTheReadDelay() {
        assertThatThrownBy(() -> service.execute("k-stop", "svc", "op", Map.of(), this::serverStopped))
                .isInstanceOf(ServerStopped.class);
        assertThat(store.records.get("k-stop").status()).isEqualTo(OperationIdempotencyStatus.IN_PROGRESS);

        clock.advance(UNKNOWN_AFTER_SECONDS - 1);
        assertThatThrownBy(() -> service.execute("k-stop", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.IN_PROGRESS_MESSAGE);

        clock.advance(2);
        assertThatThrownBy(() -> service.execute("k-stop", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.UNKNOWN_OUTCOME_MESSAGE);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void sentCallWhoseResultCannotBeStoredIsNeverExecutedAgain() {
        store.failingSaves = Integer.MAX_VALUE;

        JsonNode response = service.execute("k-lost", "svc", "op", Map.of(), this::success);

        assertThat(response.get("CODRET").asString()).isEqualTo("000");
        assertThat(store.records).containsKey("k-lost");
        clock.advance(61);
        assertThatThrownBy(() -> service.execute("k-lost", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.UNKNOWN_OUTCOME_MESSAGE);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void completedWriteIsRetriedOnce() {
        store.failingSaves = 1;

        service.execute("k-retry", "svc", "op", Map.of(), this::success);

        assertThat(store.records.get("k-retry").status()).isEqualTo(OperationIdempotencyStatus.COMPLETED);
    }

    @Test
    void completedWriteFailureFallsBackToUnknown() {
        store.failingSaves = 2;

        service.execute("k-fallback", "svc", "op", Map.of(), this::success);

        assertThat(store.records.get("k-fallback").status()).isEqualTo(OperationIdempotencyStatus.UNKNOWN);
        assertThat(store.records.get("k-fallback").expiresAt().toInstant()).isEqualTo(clock.instant().plusSeconds(TTL_SECONDS));
        assertThatThrownBy(() -> service.execute("k-fallback", "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.UNKNOWN_OUTCOME_MESSAGE);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void openCircuitReleasesTheKey() {
        assertReleased("k-cb", CallNotPermittedException.createCallNotPermittedException(CircuitBreaker.ofDefaults("svc")));
    }

    @Test
    void fullBulkheadReleasesTheKey() {
        assertReleased("k-bh", BulkheadFullException.createBulkheadFullException(Bulkhead.ofDefaults("svc")));
    }

    @Test
    void refusedConnectionReleasesTheKey() {
        assertReleased("k-cnx", new ResourceAccessException("I/O error", new ConnectException("Connection refused")));
    }

    @Test
    void unreachableHostReleasesTheKey() {
        assertReleased("k-host", new ResourceAccessException("I/O error", new UnknownHostException("adapter")));
        assertReleased("k-route", new ResourceAccessException("I/O error", new NoRouteToHostException("No route to host")));
    }

    @Test
    void inputRefusalIsReplayedWithoutCallingAgain() {
        assertThatThrownBy(() -> service.execute("k-400", "svc", "op", Map.of(),
                () -> fail(new UpstreamValidationException("svc", "002", "Compte invalide"))))
                .isInstanceOf(UpstreamValidationException.class);

        OperationIdempotencyRecord stored = store.records.get("k-400");
        assertThat(stored.status()).isEqualTo(OperationIdempotencyStatus.COMPLETED);
        assertThat(stored.code()).isEqualTo("002");
        assertThat(stored.message()).isEqualTo("Compte invalide");
        assertThat(stored.expiresAt().toInstant()).isEqualTo(clock.instant().plusSeconds(TTL_SECONDS));

        clock.advance(UNKNOWN_AFTER_SECONDS + 1);
        assertThatThrownBy(() -> service.execute("k-400", "svc", "op", Map.of(), this::success))
                .isInstanceOf(UpstreamValidationException.class)
                .hasMessage("Compte invalide")
                .extracting(ex -> ((UpstreamValidationException) ex).getCode())
                .isEqualTo("002");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void unauthorizedCallReleasesTheKey() {
        assertReleased("k-401", new UpstreamAuthenticationException("svc", "401", "Unauthorized"));
    }

    @Test
    void forbiddenBusinessRefusalIsReplayedUnchanged() {
        assertThatThrownBy(() -> service.execute("k-403", "svc", "op", Map.of(),
                () -> fail(new UpstreamBusinessException("svc", "005", "Operation non autorisee"))))
                .isInstanceOf(UpstreamBusinessException.class);
        assertThatThrownBy(() -> service.execute("k-403", "svc", "op", Map.of(), this::success))
                .isInstanceOf(UpstreamBusinessException.class)
                .hasMessage("Operation non autorisee");
        assertThat(store.records.get("k-403").status()).isEqualTo(OperationIdempotencyStatus.COMPLETED);
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void readTimeoutMarksTheOutcomeUnknown() {
        assertUnknown("k-read", new ResourceAccessException("I/O error", new SocketTimeoutException("Read timed out")));
    }

    @Test
    void upstreamServerErrorMarksTheOutcomeUnknown() {
        assertUnknown("k-5xx", new UpstreamTechnicalException("svc", "500", "Probleme technique"));
    }

    private void assertReleased(String key, RuntimeException notSent) {
        int before = calls.get();
        assertThatThrownBy(() -> service.execute(key, "svc", "op", Map.of(), () -> fail(notSent)))
                .isSameAs(notSent);
        assertThat(store.records).doesNotContainKey(key);

        JsonNode response = service.execute(key, "svc", "op", Map.of(), this::success);

        assertThat(response.get("CODRET").asString()).isEqualTo("000");
        assertThat(calls.get()).isEqualTo(before + 2);
        assertThat(store.records.get(key).status()).isEqualTo(OperationIdempotencyStatus.COMPLETED);
    }

    private void assertUnknown(String key, RuntimeException uncertain) {
        assertThatThrownBy(() -> service.execute(key, "svc", "op", Map.of(), () -> fail(uncertain)))
                .isSameAs(uncertain);
        assertThat(store.records.get(key).status()).isEqualTo(OperationIdempotencyStatus.UNKNOWN);
        assertThat(store.records.get(key).expiresAt().toInstant()).isEqualTo(clock.instant().plusSeconds(TTL_SECONDS));

        clock.advance(UNKNOWN_AFTER_SECONDS + 1);
        assertThatThrownBy(() -> service.execute(key, "svc", "op", Map.of(), this::success))
                .isInstanceOf(IdempotencyConflictException.class)
                .hasMessage(OperationIdempotencyService.UNKNOWN_OUTCOME_MESSAGE);
        assertThat(calls.get()).isEqualTo(1);
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

    private JsonNode fail(RuntimeException ex) {
        calls.incrementAndGet();
        throw ex;
    }

    private JsonNode serverStopped() {
        calls.incrementAndGet();
        throw new ServerStopped();
    }

    private static final class ServerStopped extends Error {
    }

    private static final class MutableClock extends Clock {

        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        private void advance(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final class InMemoryStore implements OperationIdempotencyStore {

        private final Map<String, OperationIdempotencyRecord> records = new HashMap<>();
        private final Clock clock;
        private int failingSaves;

        private InMemoryStore(Clock clock) {
            this.clock = clock;
        }

        @Override
        public Optional<OperationIdempotencyRecord> find(String idempotencyKey) {
            records.computeIfPresent(idempotencyKey, (key, record) -> isExpired(record) ? null : record);
            return Optional.ofNullable(records.get(idempotencyKey));
        }

        @Override
        public boolean createIfAbsent(OperationIdempotencyRecord record) {
            find(record.idempotencyKey());
            return records.putIfAbsent(record.idempotencyKey(), record) == null;
        }

        @Override
        public void save(OperationIdempotencyRecord record) {
            if (failingSaves > 0) {
                failingSaves--;
                throw new IllegalStateException("Could not write operation idempotency entry");
            }
            records.put(record.idempotencyKey(), record);
        }

        @Override
        public void delete(String idempotencyKey) {
            records.remove(idempotencyKey);
        }

        private boolean isExpired(OperationIdempotencyRecord record) {
            return !record.expiresAt().toInstant().isAfter(clock.instant());
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
 * Fabrique des clients HTTP vers les services exposes : correlation, jeton, canal et langue de l'appelant, puis un disjoncteur nomme par service.
 */
@Component
public class UpstreamRestClients {

    private final CorrelationIdInterceptor correlationIdInterceptor;
    private final UpstreamTokenInterceptor tokenInterceptor;
    private final UpstreamCallerContextInterceptor callerContextInterceptor;
    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final RetryRegistry retryRegistry;
    private final BulkheadRegistry bulkheadRegistry;
    private final long connectTimeoutSeconds;
    private final long readTimeoutSeconds;

    public UpstreamRestClients(CorrelationIdInterceptor correlationIdInterceptor,
                               UpstreamTokenInterceptor tokenInterceptor,
                               UpstreamCallerContextInterceptor callerContextInterceptor,
                               CircuitBreakerRegistry circuitBreakerRegistry,
                               RetryRegistry retryRegistry,
                               BulkheadRegistry bulkheadRegistry,
                               @Value("\${rest.client.connect-timeout-seconds}") long connectTimeoutSeconds,
                               @Value("\${rest.client.read-timeout-seconds}") long readTimeoutSeconds) {
        this.correlationIdInterceptor = correlationIdInterceptor;
        this.tokenInterceptor = tokenInterceptor;
        this.callerContextInterceptor = callerContextInterceptor;
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
                .requestInterceptor(tokenInterceptor)
                .requestInterceptor(callerContextInterceptor)
                .requestInterceptor(new UpstreamResilienceInterceptor(
                        circuitBreakerRegistry.circuitBreaker(service),
                        retryRegistry.retry(service),
                        bulkheadRegistry.bulkhead(service)));
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamTokenInterceptor.java": `package ma.eai.msiboa.api.integration.upstream;

import java.io.IOException;
import java.util.Locale;

import ma.eai.idev.fwk.logging.EaiLog;
import ma.eai.msiboa.clients.security.util.OAuth2ClientHttpRequestInterceptorFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Jeton presente au service expose selon neobank.upstream.token.mode : celui du client authentifie, sinon le jeton de service sasAccessor.
 */
@Component
public class UpstreamTokenInterceptor implements ClientHttpRequestInterceptor {

    static final String OAUTH2_REGISTRATION = "sasAccessor";

    /**
     * Choix du jeton : aucun, celui du client, celui du service, ou celui du client avec repli sur celui du service.
     */
    enum Mode {
        NONE, CLIENT, SERVICE, CLIENT_OR_SERVICE;

        static Mode of(String value) {
            String name = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
            for (Mode mode : values()) {
                if (mode.name().equals(name)) {
                    return mode;
                }
            }
            throw new IllegalArgumentException(
                    "Invalid neobank.upstream.token.mode, expected none, client, service or client-or-service");
        }
    }

    private final Mode mode;
    private final ClientHttpRequestInterceptor clientRelay;
    private final ClientHttpRequestInterceptor serviceToken;

    @Autowired
    public UpstreamTokenInterceptor(@Value("\${neobank.upstream.token.mode:client-or-service}") String mode,
                                    ObjectProvider<OAuth2ClientHttpRequestInterceptorFactory> oauth2InterceptorFactory,
                                    @Value("\${spring.security.oauth2.client.registration.sasAccessor.client-id:}") String oauth2ClientId,
                                    @Value("\${spring.security.oauth2.client.provider.sasAccessor.issuer-uri:}") String oauth2IssuerUri) {
        this(Mode.of(mode),
                Mode.of(mode) == Mode.NONE ? null : oauth2InterceptorFactory.getObject(),
                oauth2ClientId, oauth2IssuerUri);
    }

    UpstreamTokenInterceptor(Mode mode,
                             OAuth2ClientHttpRequestInterceptorFactory oauth2InterceptorFactory,
                             String oauth2ClientId,
                             String oauth2IssuerUri) {
        this.mode = mode;
        boolean serviceTokenUsed = mode == Mode.SERVICE || mode == Mode.CLIENT_OR_SERVICE;
        if (serviceTokenUsed && (isBlank(oauth2ClientId) || isBlank(oauth2IssuerUri))) {
            throw new IllegalArgumentException(
                    "neobank.upstream.token.mode requires the sasAccessor client-id and issuer-uri");
        }
        if (mode == Mode.NONE) {
            EaiLog.warn("neobank.upstream.token.mode=none, upstream calls carry no token");
        }
        this.clientRelay = mode == Mode.CLIENT || mode == Mode.CLIENT_OR_SERVICE
                ? oauth2InterceptorFactory.create("", "", "")
                : null;
        this.serviceToken = serviceTokenUsed
                ? oauth2InterceptorFactory.create(oauth2ClientId, OAUTH2_REGISTRATION, oauth2IssuerUri)
                : null;
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        ClientHttpRequestInterceptor chosen = switch (mode) {
            case NONE -> null;
            case CLIENT -> clientRelay;
            case SERVICE -> serviceToken;
            case CLIENT_OR_SERVICE -> hasClientToken() ? clientRelay : serviceToken;
        };
        return chosen == null ? execution.execute(request, body) : chosen.intercept(request, body, execution);
    }

    private static boolean hasClientToken() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getCredentials() instanceof Jwt;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamCallerContextInterceptor.java": `package ma.eai.msiboa.api.integration.upstream;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Canal et langue de l'appelant transmis au service expose : X-Canal traduit par la table neobank.upstream.channel.mapping, Accept-Language tel que recu.
 */
@Component
public class UpstreamCallerContextInterceptor implements ClientHttpRequestInterceptor {

    static final String CHANNEL_HEADER = "X-Canal";

    private static final Pattern CHANNEL_FORMAT = Pattern.compile("[A-Za-z0-9_]{1,30}");
    private static final Pattern HEADER_NAME_FORMAT = Pattern.compile("[A-Za-z0-9-]{1,60}");
    private static final Pattern LANGUAGE_FORMAT = Pattern.compile("[A-Za-z0-9,;=.* -]{1,100}");

    private final List<String> sourceHeaders;
    private final Map<String, String> mapping;
    private final String defaultChannel;

    public UpstreamCallerContextInterceptor(@Value("\${neobank.upstream.channel.headers:X-Canal}") String sourceHeaders,
                                            @Value("\${neobank.upstream.channel.mapping:}") String mapping,
                                            @Value("\${neobank.upstream.channel.default:}") String defaultChannel) {
        this.sourceHeaders = sourceHeaders(sourceHeaders);
        this.mapping = mapping(mapping);
        this.defaultChannel = defaultChannel == null || defaultChannel.isBlank() ? null : checked(defaultChannel.trim(), "default");
    }

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        HttpServletRequest inbound = inbound();
        HttpHeaders headers = request.getHeaders();
        String channel = channel(inbound);
        headers.remove(CHANNEL_HEADER);
        if (channel != null) {
            headers.set(CHANNEL_HEADER, channel);
        }
        String language = inbound == null ? null : inbound.getHeader(HttpHeaders.ACCEPT_LANGUAGE);
        headers.remove(HttpHeaders.ACCEPT_LANGUAGE);
        if (language != null && LANGUAGE_FORMAT.matcher(language).matches()) {
            headers.set(HttpHeaders.ACCEPT_LANGUAGE, language);
        }
        return execution.execute(request, body);
    }

    private String channel(HttpServletRequest inbound) {
        String received = received(inbound);
        if (received == null) {
            return defaultChannel;
        }
        if (!CHANNEL_FORMAT.matcher(received).matches()) {
            return null;
        }
        return mapping.getOrDefault(received.toUpperCase(Locale.ROOT), received);
    }

    private String received(HttpServletRequest inbound) {
        if (inbound == null) {
            return null;
        }
        for (String header : sourceHeaders) {
            String value = inbound.getHeader(header);
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static HttpServletRequest inbound() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest()
                : null;
    }

    private static List<String> sourceHeaders(String value) {
        List<String> headers = new ArrayList<>();
        for (String header : value.split(",")) {
            if (header.isBlank()) {
                continue;
            }
            if (!HEADER_NAME_FORMAT.matcher(header.trim()).matches()) {
                throw new IllegalArgumentException("Invalid neobank.upstream.channel.headers entry: " + header.trim());
            }
            headers.add(header.trim());
        }
        return List.copyOf(headers);
    }

    private static Map<String, String> mapping(String value) {
        Map<String, String> mapping = new HashMap<>();
        for (String entry : value.split(",")) {
            if (entry.isBlank()) {
                continue;
            }
            String[] pair = entry.trim().split(":");
            if (pair.length != 2) {
                throw new IllegalArgumentException("Invalid neobank.upstream.channel.mapping entry: " + entry.trim());
            }
            mapping.put(checked(pair[0].trim(), "mapping").toUpperCase(Locale.ROOT), checked(pair[1].trim(), "mapping"));
        }
        return Map.copyOf(mapping);
    }

    private static String checked(String value, String property) {
        if (!CHANNEL_FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid neobank.upstream.channel." + property + " value: " + value);
        }
        return value;
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
  "<P>-container/src/test/java/ma/eai/msiboa/api/integration/upstream/UpstreamRestClientsTest.java": `package ma.eai.msiboa.api.integration.upstream;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import io.github.resilience4j.bulkhead.BulkheadRegistry;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.retry.RetryRegistry;
import ma.eai.msiboa.api.integration.CorrelationIdInterceptor;
import ma.eai.msiboa.clients.security.config.ForwardHeadersProperties;
import ma.eai.msiboa.clients.security.service.TokenManagementService;
import ma.eai.msiboa.clients.security.util.OAuth2ClientHttpRequestInterceptorFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class UpstreamRestClientsTest {

    private static final String BASE_URL = "http://adapter.test/neobank-svc";

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void callCarriesTheTokenTheChannelAndTheLanguageOfTheCaller() {
        MockHttpServletRequest inbound = new MockHttpServletRequest();
        inbound.addHeader("X-Canal", "NEOBANQUE_MOBILE");
        inbound.addHeader(HttpHeaders.ACCEPT_LANGUAGE, "ar");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(inbound));
        RestClient.Builder builder = clients(UpstreamTokenInterceptor.Mode.SERVICE).builder("svc", BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(BASE_URL + "/api/x"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer jeton-de-test"))
                .andExpect(header("X-Canal", "MOBILE"))
                .andExpect(header(HttpHeaders.ACCEPT_LANGUAGE, "ar"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        builder.build().post().uri("/api/x").retrieve().toBodilessEntity();

        server.verify();
    }

    @Test
    void callOutsideOfARequestWithoutTokenCarriesNoCallerHeader() {
        RestClient.Builder builder = clients(UpstreamTokenInterceptor.Mode.NONE).builder("svc", BASE_URL);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(BASE_URL + "/api/x"))
                .andExpect(headerDoesNotExist(HttpHeaders.AUTHORIZATION))
                .andExpect(headerDoesNotExist("X-Canal"))
                .andExpect(headerDoesNotExist(HttpHeaders.ACCEPT_LANGUAGE))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        builder.build().get().uri("/api/x").retrieve().toBodilessEntity();

        server.verify();
    }

    private static UpstreamRestClients clients(UpstreamTokenInterceptor.Mode mode) {
        CorrelationIdInterceptor correlation = new CorrelationIdInterceptor();
        ReflectionTestUtils.setField(correlation, "correlationHeaderName", "X-Correlation-ID");
        TokenManagementService tokens = new TokenManagementService(null) {
            @Override
            public String getAccessToken(String first, String second, String third) {
                return "jeton-de-test";
            }
        };
        return new UpstreamRestClients(correlation,
                new UpstreamTokenInterceptor(mode,
                        new OAuth2ClientHttpRequestInterceptorFactory(tokens, new ForwardHeadersProperties()),
                        "client-test",
                        "http://localhost:1/realms/test"),
                new UpstreamCallerContextInterceptor("X-Canal", "NEOBANQUE_MOBILE:MOBILE", ""),
                CircuitBreakerRegistry.ofDefaults(),
                RetryRegistry.ofDefaults(),
                BulkheadRegistry.ofDefaults(),
                5,
                30);
    }
}
`,
  "<P>-container/src/test/java/ma/eai/msiboa/api/integration/upstream/UpstreamTokenInterceptorTest.java": `package ma.eai.msiboa.api.integration.upstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.util.concurrent.atomic.AtomicInteger;

import ma.eai.msiboa.api.integration.upstream.UpstreamTokenInterceptor.Mode;
import ma.eai.msiboa.clients.security.config.ForwardHeadersProperties;
import ma.eai.msiboa.clients.security.service.TokenManagementService;
import ma.eai.msiboa.clients.security.util.OAuth2ClientHttpRequestInterceptorFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.StringUtils;

class UpstreamTokenInterceptorTest {

    private final AtomicInteger serviceTokenRequests = new AtomicInteger();
    private final OAuth2ClientHttpRequestInterceptorFactory factory = new OAuth2ClientHttpRequestInterceptorFactory(
            new TokenManagementService(null) {
                @Override
                public String getAccessToken(String first, String second, String third) {
                    if (StringUtils.hasText(first) && StringUtils.hasText(second)) {
                        serviceTokenRequests.incrementAndGet();
                        return "jeton-de-service";
                    }
                    return super.getAccessToken(first, second, third);
                }
            },
            new ForwardHeadersProperties());

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void clientOrServiceRelaysTheClientTokenWithoutAskingForAServiceToken() throws IOException {
        authenticate("jeton-du-client");

        assertThat(authorization(Mode.CLIENT_OR_SERVICE)).isEqualTo("Bearer jeton-du-client");
        assertThat(serviceTokenRequests).hasValue(0);
    }

    @Test
    void clientOrServiceFallsBackToTheServiceTokenWithoutAuthenticatedClient() throws IOException {
        assertThat(authorization(Mode.CLIENT_OR_SERVICE)).isEqualTo("Bearer jeton-de-service");
    }

    @Test
    void serviceModeIgnoresTheClientToken() throws IOException {
        authenticate("jeton-du-client");

        assertThat(authorization(Mode.SERVICE)).isEqualTo("Bearer jeton-de-service");
    }

    @Test
    void clientModeSendsNoTokenWithoutAuthenticatedClient() throws IOException {
        assertThat(authorization(Mode.CLIENT)).isNull();
        assertThat(serviceTokenRequests).hasValue(0);
    }

    @Test
    void noneModeSendsNoToken() throws IOException {
        authenticate("jeton-du-client");

        assertThat(authorization(Mode.NONE)).isNull();
    }

    @Test
    void modeIsReadFromItsPropertyValueAndRefusedWhenUnknown() {
        assertThat(Mode.of("client-or-service")).isEqualTo(Mode.CLIENT_OR_SERVICE);
        assertThat(Mode.of(" Service ")).isEqualTo(Mode.SERVICE);
        assertThatThrownBy(() -> Mode.of("jwt")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Mode.of("")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void modesUsingTheServiceTokenRefuseABlankClientIdOrIssuer() {
        assertThatThrownBy(() -> new UpstreamTokenInterceptor(Mode.SERVICE, factory, " ", "http://localhost:1/realms/test"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UpstreamTokenInterceptor(Mode.CLIENT_OR_SERVICE, factory, "client-test", ""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private String authorization(Mode mode) throws IOException {
        UpstreamTokenInterceptor interceptor = new UpstreamTokenInterceptor(mode,
                mode == Mode.NONE ? null : factory, "client-test", "http://localhost:1/realms/test");
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.POST, URI.create("http://h/api/x"));
        interceptor.intercept(request, new byte[0], (sent, body) -> null);
        return request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
    }

    private static void authenticate(String token) {
        Jwt jwt = Jwt.withTokenValue(token).header("alg", "RS256").subject("client-1").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }
}
`,
  "<P>-container/src/test/java/ma/eai/msiboa/api/integration/upstream/UpstreamCallerContextInterceptorTest.java": `package ma.eai.msiboa.api.integration.upstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class UpstreamCallerContextInterceptorTest {

    private static final String MAPPING = "NEOBANQUE_MOBILE:MOBILE,BACK_OFFICE:WEB,PFM:MOBILE";

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void projectChannelIsTranslatedWhateverItsCase() throws IOException {
        inbound("X-Canal", "neobanque_mobile");

        assertThat(sent(interceptor("")).getFirst("X-Canal")).isEqualTo("MOBILE");
    }

    @Test
    void channelOutOfTheMappingIsSentAsReceived() throws IOException {
        inbound("X-Canal", "WEB");

        assertThat(sent(interceptor("")).getFirst("X-Canal")).isEqualTo("WEB");
    }

    @Test
    void nextSourceHeaderIsReadWhenTheFirstIsMissing() throws IOException {
        inbound("X-Channel", "PFM");

        assertThat(sent(interceptor("")).getFirst("X-Canal")).isEqualTo("MOBILE");
    }

    @Test
    void missingChannelIsSentOnlyWhenADefaultIsSet() throws IOException {
        inbound(HttpHeaders.ACCEPT_LANGUAGE, "fr");

        assertThat(sent(interceptor("")).getFirst("X-Canal")).isNull();
        assertThat(sent(interceptor("WEB")).getFirst("X-Canal")).isEqualTo("WEB");
    }

    @Test
    void malformedChannelIsNotSent() throws IOException {
        inbound("X-Canal", "MOBILE WEB");

        assertThat(sent(interceptor("WEB")).getFirst("X-Canal")).isNull();
    }

    @Test
    void languageIsRelayedAsReceived() throws IOException {
        inbound(HttpHeaders.ACCEPT_LANGUAGE, "ar-MA,ar;q=0.9,fr;q=0.8");

        assertThat(sent(interceptor("")).getFirst(HttpHeaders.ACCEPT_LANGUAGE)).isEqualTo("ar-MA,ar;q=0.9,fr;q=0.8");
    }

    @Test
    void malformedLanguageIsNotSent() throws IOException {
        inbound(HttpHeaders.ACCEPT_LANGUAGE, "fr<script>");

        assertThat(sent(interceptor("")).getFirst(HttpHeaders.ACCEPT_LANGUAGE)).isNull();
    }

    @Test
    void callOutsideOfARequestSendsOnlyTheDefaultChannel() throws IOException {
        HttpHeaders headers = sent(interceptor("WEB"));

        assertThat(headers.getFirst("X-Canal")).isEqualTo("WEB");
        assertThat(headers.getFirst(HttpHeaders.ACCEPT_LANGUAGE)).isNull();
    }

    @Test
    void valuesAlreadySetOnTheOutgoingRequestAreDroppedWhenTheReceivedOnesAreRefused() throws IOException {
        inbound("X-Canal", "MOBILE WEB");
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.GET, URI.create("http://h/api/x"));
        request.getHeaders().set("X-Canal", "AGENCE");
        request.getHeaders().set(HttpHeaders.ACCEPT_LANGUAGE, "fr<script>");

        interceptor("").intercept(request, new byte[0], (outbound, body) -> null);

        assertThat(request.getHeaders().getFirst("X-Canal")).isNull();
        assertThat(request.getHeaders().getFirst(HttpHeaders.ACCEPT_LANGUAGE)).isNull();
    }

    @Test
    void invalidConfigurationIsRefusedAtStartup() {
        assertThatThrownBy(() -> new UpstreamCallerContextInterceptor("X-Canal", "NEOBANQUE_MOBILE", ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UpstreamCallerContextInterceptor("X-Canal", "BACK OFFICE:WEB", ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UpstreamCallerContextInterceptor("X Canal", MAPPING, ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new UpstreamCallerContextInterceptor("X-Canal", MAPPING, "WEB MOBILE"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static void inbound(String name, String value) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(name, value);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private static UpstreamCallerContextInterceptor interceptor(String defaultChannel) {
        return new UpstreamCallerContextInterceptor("X-Canal,X-Channel", MAPPING, defaultChannel);
    }

    private static HttpHeaders sent(UpstreamCallerContextInterceptor interceptor) throws IOException {
        MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.GET, URI.create("http://h/api/x"));
        interceptor.intercept(request, new byte[0], (outbound, body) -> null);
        return request.getHeaders();
    }
}
`,
  "<P>-container/src/test/java/ma/eai/msiboa/api/integration/upstream/UpstreamErrorDecoderTest.java": `package ma.eai.msiboa.api.integration.upstream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;

import ma.eai.msiboa.api.domain.exception.UpstreamAuthenticationException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamChannelException;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpResponse;
import tools.jackson.databind.json.JsonMapper;

class UpstreamErrorDecoderTest {

    private final UpstreamErrorDecoder decoder = new UpstreamErrorDecoder("svc",
            UpstreamReturnCodes.of(List.of("005"), List.of("333")), JsonMapper.builder().build());
    private final MockClientHttpRequest request = new MockClientHttpRequest(HttpMethod.POST, URI.create("http://h/api/x"));

    @Test
    void unauthorizedIsAnAuthenticationRefusal() {
        assertThatThrownBy(() -> decoder.handle(request, response(401, "<html>Error 401</html>")))
                .isInstanceOf(UpstreamAuthenticationException.class);
    }

    @Test
    void forbiddenWithBusinessCodeStaysABusinessRefusal() {
        assertThatThrownBy(() -> decoder.handle(request, response(403, "{\\"code\\":\\"005\\",\\"message\\":\\"Operation non autorisee\\"}")))
                .isInstanceOf(UpstreamBusinessException.class)
                .hasMessage("Operation non autorisee");
    }

    @Test
    void forbiddenWithUnknownCodeStaysATechnicalError() {
        assertThatThrownBy(() -> decoder.handle(request, response(403, "{\\"code\\":\\"999\\"}")))
                .isExactlyInstanceOf(UpstreamTechnicalException.class);
    }

    @Test
    void codifiedMessageOfABusinessRefusalIsKept() {
        String body = "{\\"code\\":\\"005\\",\\"message\\":\\"Plafond depasse\\",\\"timestamp\\":0,"
                + "\\"codeMessage\\":\\"PLAFOND_DEPASSE\\",\\"parametres\\":{\\"p1\\":\\"5000\\"},\\"messageLegacy\\":\\"Plafond atteint\\"}";

        assertThatThrownBy(() -> decoder.handle(request, response(422, body)))
                .isInstanceOfSatisfying(UpstreamBusinessException.class, ex -> {
                    assertThat(ex.getMessage()).isEqualTo("Plafond depasse");
                    assertThat(ex.getDetail().codeMessage()).isEqualTo("PLAFOND_DEPASSE");
                    assertThat(ex.getDetail().parametres()).containsEntry("p1", "5000");
                    assertThat(ex.getDetail().messageLegacy()).isEqualTo("Plafond atteint");
                });
    }

    @Test
    void codifiedMessageOfAnInputRefusalIsKept() {
        String body = "{\\"code\\":\\"400\\",\\"message\\":\\"Demande illisible\\","
                + "\\"codeMessage\\":\\"API_FLUX_INVALIDE\\",\\"parametres\\":{},\\"messageLegacy\\":\\"Demande illisible\\"}";

        assertThatThrownBy(() -> decoder.handle(request, response(400, body)))
                .isInstanceOfSatisfying(UpstreamValidationException.class, ex -> {
                    assertThat(ex.getDetail().codeMessage()).isEqualTo("API_FLUX_INVALIDE");
                    assertThat(ex.getDetail().parametres()).isEmpty();
                });
    }

    @Test
    void bodyWithoutCodifiedMessageIsStillRead() {
        assertThatThrownBy(() -> decoder.handle(request, response(422, "{\\"code\\":\\"005\\",\\"message\\":\\"Motif\\",\\"timestamp\\":0}")))
                .isInstanceOfSatisfying(UpstreamBusinessException.class, ex -> {
                    assertThat(ex.getDetail().codeMessage()).isNull();
                    assertThat(ex.getDetail().parametres()).isNull();
                    assertThat(ex.getDetail().messageLegacy()).isNull();
                });
    }

    @Test
    void channelRefusalKeepsTheStatusGivenByTheService() {
        assertThatThrownBy(() -> decoder.handle(request, response(400, "{\\"code\\":\\"400\\",\\"codeMessage\\":\\"CANAL_MANQUANT\\"}")))
                .isInstanceOfSatisfying(UpstreamChannelException.class, ex -> assertThat(ex.getStatus()).isEqualTo(400));
        assertThatThrownBy(() -> decoder.handle(request,
                response(403, "{\\"code\\":\\"403\\",\\"codeMessage\\":\\"CANAL_INCONNU\\",\\"parametres\\":{\\"p1\\":\\"AGENCE\\"}}")))
                .isInstanceOfSatisfying(UpstreamChannelException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(403);
                    assertThat(ex.getDetail().parametres()).containsEntry("p1", "AGENCE");
                });
    }

    @Test
    void channelCodeUnderAnotherStatusIsClassifiedAsUsual() {
        assertThatThrownBy(() -> decoder.handle(request, response(500, "{\\"code\\":\\"500\\",\\"codeMessage\\":\\"CANAL_INCONNU\\"}")))
                .isExactlyInstanceOf(UpstreamTechnicalException.class);
        assertThatThrownBy(() -> decoder.handle(request, response(403, "{\\"code\\":\\"005\\",\\"codeMessage\\":\\"CANAL_MANQUANT\\"}")))
                .isInstanceOf(UpstreamBusinessException.class);
    }

    @Test
    void messageParametersKeepOnlyBoundedScalars() {
        String body = "{\\"code\\":\\"005\\",\\"codeMessage\\":\\"PLAFOND_DEPASSE\\",\\"parametres\\":{\\"p1\\":\\"" + "9".repeat(300)
                + "\\",\\"p2\\":{\\"a\\":1},\\"p3\\":[1],\\"p4\\":12,\\"p5\\":null}}";

        assertThatThrownBy(() -> decoder.handle(request, response(422, body)))
                .isInstanceOfSatisfying(UpstreamBusinessException.class, ex -> {
                    assertThat(ex.getDetail().parametres()).containsOnlyKeys("p1", "p4");
                    assertThat(ex.getDetail().parametres().get("p1")).isEqualTo("9".repeat(200));
                    assertThat(ex.getDetail().parametres().get("p4")).isEqualTo(12);
                });
    }

    private static MockClientHttpResponse response(int status, String body) {
        return new MockClientHttpResponse(body.getBytes(StandardCharsets.UTF_8), HttpStatusCode.valueOf(status));
    }
}
`,
  "<P>-container/src/main/java/ma/eai/msiboa/api/integration/upstream/UpstreamErrorDecoder.java": `package ma.eai.msiboa.api.integration.upstream;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import ma.eai.msiboa.api.domain.exception.UpstreamAuthenticationException;
import ma.eai.msiboa.api.domain.exception.UpstreamBusinessException;
import ma.eai.msiboa.api.domain.exception.UpstreamChannelException;
import ma.eai.msiboa.api.domain.exception.UpstreamErrorDetail;
import ma.eai.msiboa.api.domain.exception.UpstreamTechnicalException;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpResponse;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Lecture du corps d'erreur d'un service expose, message codifie compris, et classement par code retour, le statut HTTP de l'aval n'etant pas fiable.
 */
public class UpstreamErrorDecoder {

    private static final Map<String, Integer> CHANNEL_REFUSALS = Map.of("CANAL_MANQUANT", 400, "CANAL_INCONNU", 403);
    private static final int MAX_PARAMETERS = 20;
    private static final int MAX_PARAMETER_LENGTH = 200;

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
        UpstreamErrorDetail detail = UpstreamErrorDetail.NONE;
        try {
            JsonNode body = objectMapper.readTree(response.getBody());
            if (body != null && body.hasNonNull("code")) {
                code = body.get("code").asString();
            }
            if (body != null && body.hasNonNull("message")) {
                message = body.get("message").asString();
            }
            if (body != null) {
                detail = new UpstreamErrorDetail(text(body, "codeMessage"), parameters(body), text(body, "messageLegacy"));
            }
        } catch (JacksonException ex) {
            message = null;
        }

        if (detail.codeMessage() != null && Integer.valueOf(status).equals(CHANNEL_REFUSALS.get(detail.codeMessage()))) {
            throw new UpstreamChannelException(service, code, message, detail, status);
        }
        if (returnCodes.business().contains(code)) {
            throw new UpstreamBusinessException(service, code, message, detail);
        }
        if (returnCodes.validation().contains(code) || status == 400) {
            throw new UpstreamValidationException(service, code, message, detail);
        }
        if (status == 401) {
            throw new UpstreamAuthenticationException(service, code, message);
        }
        throw new UpstreamTechnicalException(service, code, message);
    }

    private static String text(JsonNode body, String field) {
        JsonNode value = body.get(field);
        return value != null && value.isValueNode() && !value.isNull() ? value.asString() : null;
    }

    private Map<String, Object> parameters(JsonNode body) {
        JsonNode value = body.get("parametres");
        if (value == null || !value.isObject()) {
            return null;
        }
        Map<String, Object> parameters = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> entry : value.properties()) {
            JsonNode parameter = entry.getValue();
            if (parameters.size() == MAX_PARAMETERS) {
                break;
            }
            if (!parameter.isValueNode() || parameter.isNull() || entry.getKey().length() > MAX_PARAMETER_LENGTH) {
                continue;
            }
            Object scalar = objectMapper.treeToValue(parameter, Object.class);
            parameters.put(entry.getKey(), scalar instanceof String text && text.length() > MAX_PARAMETER_LENGTH
                    ? text.substring(0, MAX_PARAMETER_LENGTH)
                    : scalar);
        }
        return parameters;
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

    @Override
    public void delete(String idempotencyKey) {
        try {
            dataGrid.remove(cacheName, KEY_PREFIX + idempotencyKey);
        } catch (Exception e) {
            EaiLog.error("Could not delete operation idempotency entry " + idempotencyKey, e);
            throw new IllegalStateException("Could not delete operation idempotency entry", e);
        }
    }

    private int ttlSeconds(OperationIdempotencyRecord record) {
        long seconds = Duration.between(Instant.now(), record.expiresAt().toInstant()).getSeconds();
        return Math.toIntExact(Math.max(1, Math.min(Integer.MAX_VALUE, seconds)));
    }
}
`,
  "<P>-application/src/test/java/ma/eai/msiboa/api/application/error/IdempotencyKeyStatusTest.java": `package ma.eai.msiboa.api.application.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import ma.eai.msiboa.api.application.idempotency.OperationIdempotencyService;
import ma.eai.msiboa.api.domain.exception.UpstreamChannelException;
import ma.eai.msiboa.api.domain.exception.UpstreamErrorDetail;
import ma.eai.msiboa.api.domain.exception.UpstreamValidationException;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.ports.output.repository.OperationIdempotencyStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.ResourceAccessException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class IdempotencyKeyStatusTest {

    private final JsonMapper mapper = JsonMapper.builder().build();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        OperationIdempotencyService service = new OperationIdempotencyService(new InMemoryStore(), mapper, 3600, 30);
        UpstreamExceptionHandler handler = new UpstreamExceptionHandler();
        ReflectionTestUtils.setField(handler, "correlationHeaderName", "X-Correlation-Id");
        GlobalExceptionHandler globalHandler = new GlobalExceptionHandler();
        ReflectionTestUtils.setField(globalHandler, "correlationHeaderName", "X-Correlation-Id");
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController(service, mapper))
                .setControllerAdvice(handler, globalHandler)
                .build();
    }

    @Test
    void unknownOutcomeIsRefusedWithConflictAndExplicitMessage() throws Exception {
        mockMvc.perform(post("/probe").header("Idempotency-Key", "k-unknown").header("X-Probe-Outcome", "timeout"))
                .andExpect(status().isServiceUnavailable());

        MvcResult replay = mockMvc.perform(post("/probe").header("Idempotency-Key", "k-unknown")).andReturn();

        assertThat(replay.getResponse().getStatus()).isEqualTo(409);
        assertThat(errorBody(replay).get("message").asString())
                .isEqualTo(OperationIdempotencyService.UNKNOWN_OUTCOME_MESSAGE);
    }

    @Test
    void inputRefusalIsReplayedAsTheSameBadRequest() throws Exception {
        MvcResult first = mockMvc.perform(post("/probe").header("Idempotency-Key", "k-invalid").header("X-Probe-Outcome", "invalid"))
                .andReturn();
        MvcResult replay = mockMvc.perform(post("/probe").header("Idempotency-Key", "k-invalid")).andReturn();

        assertThat(first.getResponse().getStatus()).isEqualTo(400);
        assertThat(replay.getResponse().getStatus()).isEqualTo(400);
        assertThat(errorBody(replay).get("code").asString()).isEqualTo("002");
        assertThat(errorBody(replay).get("codeMessage").asString()).isEqualTo("COMPTE_INVALIDE");
        assertThat(errorBody(replay).get("parametres").get("p1").asString()).isEqualTo("RIB");
        assertThat(errorBody(replay).get("messageLegacy").asString()).isEqualTo("Compte errone");
        assertThat(errorBody(replay)).isEqualTo(errorBody(first));
    }

    @Test
    void channelRefusalKeepsItsStatusAndLetsTheSameKeyRunAgain() throws Exception {
        MvcResult refused = mockMvc.perform(post("/probe").header("Idempotency-Key", "k-channel").header("X-Probe-Outcome", "channel"))
                .andReturn();

        assertThat(refused.getResponse().getStatus()).isEqualTo(403);
        assertThat(errorBody(refused).get("codeMessage").asString()).isEqualTo("CANAL_INCONNU");
        mockMvc.perform(post("/probe").header("Idempotency-Key", "k-channel"))
                .andExpect(status().isOk());
    }

    @Test
    void callNotSentLetsTheSameKeyRunAgain() throws Exception {
        mockMvc.perform(post("/probe").header("Idempotency-Key", "k-refused").header("X-Probe-Outcome", "refused"))
                .andExpect(status().isServiceUnavailable());

        mockMvc.perform(post("/probe").header("Idempotency-Key", "k-refused"))
                .andExpect(status().isOk());
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

    @Test
    void missingAndInvalidKeyReturnTheSameErrorBody() throws Exception {
        JsonNode missing = errorBody(mockMvc.perform(post("/probe")).andReturn());
        JsonNode invalid = errorBody(mockMvc.perform(post("/probe").header("Idempotency-Key", "k 1")).andReturn());

        assertThat(missing).isEqualTo(invalid);
        assertThat(missing.get("status").asInt()).isEqualTo(400);
        assertThat(missing.get("message").asString()).isEqualTo("Idempotency-Key is missing or invalid");
    }

    private JsonNode errorBody(MvcResult result) throws Exception {
        ObjectNode body = (ObjectNode) mapper.readTree(result.getResponse().getContentAsString());
        body.remove("timestamp");
        return body;
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
        public ResponseEntity<String> probe(@RequestHeader(value = "Idempotency-Key", required = true) String idempotencyKey,
                                            @RequestHeader(value = "X-Probe-Outcome", required = false) String outcome) {
            service.execute(idempotencyKey, "svc", "op", Map.of(), () -> {
                if ("timeout".equals(outcome)) {
                    throw new ResourceAccessException("I/O error", new SocketTimeoutException("Read timed out"));
                }
                if ("refused".equals(outcome)) {
                    throw new ResourceAccessException("I/O error", new ConnectException("Connection refused"));
                }
                if ("invalid".equals(outcome)) {
                    throw new UpstreamValidationException("svc", "002", "Compte invalide",
                            new UpstreamErrorDetail("COMPTE_INVALIDE", Map.of("p1", "RIB"), "Compte errone"));
                }
                if ("channel".equals(outcome)) {
                    throw new UpstreamChannelException("svc", "403", "Canal non autorise",
                            new UpstreamErrorDetail("CANAL_INCONNU", Map.of("p1", "AGENCE"), "Canal non autorise"), 403);
                }
                return mapper.createObjectNode();
            });
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

        @Override
        public void delete(String idempotencyKey) {
            records.remove(idempotencyKey);
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
import ma.eai.msiboa.api.domain.exception.UpstreamErrorDetail;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyRecord;
import ma.eai.msiboa.api.domain.idempotency.model.OperationIdempotencyStatus;
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
    private final InMemoryDataGrid dataGrid = new InMemoryDataGrid();
    private final DataGridOperationIdempotencyStore store =
            new DataGridOperationIdempotencyStore(dataGrid, mapper, CACHE);

    @Test
    void secondReservationOfSameKeyIsRefused() {
        assertThat(store.createIfAbsent(record("k-1"))).isTrue();
        assertThat(store.createIfAbsent(record("k-1"))).isFalse();
    }

    @Test
    void deletedKeyCanBeReservedAgain() {
        assertThat(store.createIfAbsent(record("k-del"))).isTrue();
        store.delete("k-del");

        assertThat(store.find("k-del")).isEmpty();
        assertThat(store.createIfAbsent(record("k-del"))).isTrue();
    }

    @Test
    void codifiedMessageOfARefusalIsReadBackFromDataGrid() {
        store.save(record("k-detail").toBuilder()
                .code("005")
                .message("Plafond depasse")
                .detail(new UpstreamErrorDetail("PLAFOND_DEPASSE", Map.of("p1", "5000"), "Plafond atteint"))
                .build());

        UpstreamErrorDetail detail = store.find("k-detail").orElseThrow().detail();

        assertThat(detail.codeMessage()).isEqualTo("PLAFOND_DEPASSE");
        assertThat(detail.parametres()).containsEntry("p1", "5000");
        assertThat(detail.messageLegacy()).isEqualTo("Plafond atteint");
        assertThat(store.find("k-absent")).isEmpty();
    }

    @Test
    void reservationIsKeptInDataGridForTheFullRetention() {
        OperationIdempotencyService service = new OperationIdempotencyService(store, mapper, 86400, 30);

        service.execute("k-lock", "svc", "op", Map.of(), () -> {
            assertThat(dataGrid.ttls.get(CACHE + "/operation:k-lock")).isBetween(86399L, 86400L);
            return mapper.createObjectNode();
        });

        assertThat(dataGrid.ttls.get(CACHE + "/operation:k-lock")).isBetween(86399L, 86400L);
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

            @Override
            public void delete(String idempotencyKey) {
                store.delete(idempotencyKey);
            }
        };
        OperationIdempotencyService service = new OperationIdempotencyService(racingStore, mapper, 3600, 30);
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
                .status(OperationIdempotencyStatus.IN_PROGRESS)
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
        private final Map<String, Long> ttls = new ConcurrentHashMap<>();

        @Override
        public void put(String cacheName, String key, String value, long ttlSeconds) {
            entries.put(cacheName + "/" + key, value);
            ttls.put(cacheName + "/" + key, ttlSeconds);
        }

        @Override
        public boolean putIfAbsent(String cacheName, String key, String value, long ttlSeconds) {
            boolean created = entries.putIfAbsent(cacheName + "/" + key, value) == null;
            if (created) {
                ttls.put(cacheName + "/" + key, ttlSeconds);
            }
            return created;
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
