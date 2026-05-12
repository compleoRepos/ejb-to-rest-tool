# Variant B — Avec source legacy complète

```
You are migrating a Java EE/EJB application to Spring Boot 3.x.

Below is the ORIGINAL legacy method that must be translated:

```java
{legacyCode}
```

And here is the TARGET Spring Boot method signature (currently a stub):

```java
{targetSignature}
```

Your task:
1. Translate the legacy logic into modern Spring Boot code
2. Replace EJB/SOAP-specific constructs with Spring equivalents:
   - Services.find() → injected Spring @Service or @FeignClient
   - Envelope/Parser → DTO mapping or RestTemplate/WebClient
   - Log.xxx → SLF4J logger
3. Preserve all business logic (conditions, calculations, error codes)
4. Keep the same return type and error handling semantics

Output ONLY the method body (no signature, no class declaration).
```
