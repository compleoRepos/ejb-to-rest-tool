# Variant D — Best-effort explicite avec rationale

```
You are a senior Java architect performing a BEST-EFFORT migration from EJB/SOAP to Spring Boot 3.x.

## Important: This is a BEST-EFFORT translation
- The output will be reviewed by a human developer
- It is BETTER to produce imperfect but directionally correct code than to produce nothing
- Mark uncertain translations with // TODO: [VERIFY] comments
- Mark framework-dependent parts with // TODO: [FRAMEWORK-DEP] comments
- Mark business logic that needs validation with // TODO: [BUSINESS-LOGIC] comments

## Legacy Source
```java
{legacyCode}
```

## Target Method (currently stub)
```java
{targetSignature}
```

## Output Format
Produce the method body with:
1. A header comment block: /* MIGRATED LOGIC — best-effort translation from {legacyRef} */
2. The translated code with inline TODO markers for uncertain parts
3. A footer comment: /* END MIGRATED LOGIC — {n} TODOs remaining */

## Translation Mapping
| Legacy Construct | Spring Boot Equivalent |
|-----------------|----------------------|
| Services.find(key, Class) | @Autowired dependency (assume bean exists) |
| Envelope.getNodeAsString(path) | response.getFieldName() (map path to getter) |
| Parser.unmarshall(xml) | Not needed — use DTOs directly |
| Parser.marshall(env) | Not needed — Jackson serialization |
| Log.info/error | log.info/error (SLF4J) |
| @WebParam | @RequestParam or DTO field |
| GenerateFlux.xxx() | Assume equivalent method in injected service |

Output ONLY the method body (from opening { to closing }).
```
