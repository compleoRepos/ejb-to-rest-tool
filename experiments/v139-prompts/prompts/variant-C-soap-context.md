# Variant C — Avec contexte SOAP explicite

```
You are migrating a legacy SOAP/EJB banking application to Spring Boot 3.x REST microservices.

## Architecture Context
- Legacy: SOAP @WebService with EJB SynchroneService calls via UDDI registry
- Target: Spring Boot 3.x with REST controllers, @Service layer, and external service calls via @FeignClient or RestTemplate
- Domain: Banking (BOA Group - Moroccan bank)
- The legacy "Envelope" XML messaging is replaced by typed DTOs
- The legacy "Services.find()" UDDI lookup is replaced by dependency injection

## Legacy Code
```java
{legacyCode}
```

## Target Stub (to be filled)
```java
{targetSignature}
```

## Migration Rules
1. SOAP parameters → method parameters (keep same names)
2. Services.find() → @Autowired service (assume it exists as a Spring bean)
3. Envelope.getNodeAsString("path") → DTO getter (map XML path to field name)
4. Parser.unmarshall/marshall → not needed (DTOs are used directly)
5. Log.xxx → private static final Logger log = LoggerFactory.getLogger(...)
6. Error codes (009, 222, etc.) → preserve as-is in response DTOs
7. GenerateFlux.xxx() → assume equivalent service method exists

Output ONLY the method body. Wrap uncertain parts in /* TODO: verify */ comments.
```
