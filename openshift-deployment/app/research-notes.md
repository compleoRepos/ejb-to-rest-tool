# Research Notes - Java Best Practices for AI Engine

## OWASP Java Security Rules
1. **SQL Injection Prevention**: Use PreparedStatement, never string concatenation for queries
2. **JPA Injection Prevention**: Use parameterized queries with named parameters
3. **OS Command Injection**: Use Java API instead of Runtime.exec()
4. **XPath Injection**: Use parameterized XPath queries
5. **LDAP Injection**: Validate/escape LDAP special characters
6. **Log Injection**: Sanitize user input in log statements
7. **Input Validation**: Use allowlist approach + output sanitizing/escaping
8. **Cryptography**: Use strong algorithms (AES-256, SHA-256+), avoid MD5/SHA-1
9. **Session Management**: Secure cookies, timeout, regenerate session ID
10. **Error Handling**: Never expose stack traces to users

## SonarQube Categories
- **Bugs**: Null pointer dereference, resource leaks, infinite loops
- **Vulnerabilities**: SQL injection, XSS, insecure deserialization, hardcoded credentials
- **Code Smells**: Long methods, complex conditionals, duplicated code, unused variables
- **Security Hotspots**: Regex DoS, weak crypto, insecure random

## SOLID Principles Detection
- **S** (SRP): Class doing too many things (>5 public methods of different concerns)
- **O** (OCP): Switch statements on type, instanceof chains
- **L** (LSP): Overriding methods that throw UnsupportedOperationException
- **I** (ISP): Interfaces with >7 methods, implementing empty methods
- **D** (DIP): Direct instantiation of concrete classes, no interface usage

## Clean Code Rules
- Method too long (>30 lines)
- Too many parameters (>4)
- Deep nesting (>3 levels)
- Magic numbers/strings
- Dead code (unreachable, commented out)
- God class (>500 lines, >20 methods)
- Feature envy (accessing other class data more than own)
- Data clumps (same group of parameters repeated)

## PMD/SpotBugs/Checkstyle Categories
- **PMD**: Best practices, code style, design, error prone, multithreading, performance
- **SpotBugs**: Bad practice, correctness, security, performance, dodgy code
- **Checkstyle**: Naming conventions, Javadoc, imports, whitespace, coding standards

## Java Legacy Migration Specific Rules
- **EJB**: @EJB injection → @Autowired, JNDI lookup → Spring DI
- **Servlet**: HttpServlet → @RestController, doGet/doPost → @GetMapping/@PostMapping
- **Struts**: ActionForm → DTO, Action → Controller, struts-config.xml → annotations
- **SOAP**: JAX-WS → REST, WSDL → OpenAPI, SOAPFault → ResponseEntity
- **JDBC**: Statement → JPA Repository, ResultSet → Entity mapping
- **Hibernate**: SessionFactory → EntityManager, HQL → JPQL/Criteria
- **JMS**: MessageListener → @KafkaListener, Queue → Topic
- **Batch**: Quartz/cron → Spring Batch @Scheduled

## Resilience Patterns
- Circuit Breaker (Resilience4j)
- Retry with exponential backoff
- Timeout configuration
- Bulkhead isolation
- Rate limiting
- Fallback methods

## Observability Rules
- Structured logging (SLF4J + Logback)
- Correlation ID propagation
- Health check endpoints (/actuator/health)
- Metrics exposure (Micrometer + Prometheus)
- Distributed tracing (OpenTelemetry)

## Refactoring Guru - Code Smells Categories

### Bloaters
- Long Method (>10 lines should question, >30 definite smell)
- Large Class (too many fields/methods/lines)
- Primitive Obsession (using primitives instead of small objects)
- Long Parameter List (>3-4 parameters)
- Data Clumps (identical groups of variables repeated)

### Object-Orientation Abusers
- Switch Statements (complex switch/if-else chains on type)
- Temporary Field (fields only set in certain circumstances)
- Refused Bequest (subclass uses few parent methods)
- Alternative Classes with Different Interfaces

### Change Preventers
- Divergent Change (class changed for many different reasons)
- Shotgun Surgery (single change requires many small changes)
- Parallel Inheritance Hierarchies

### Dispensables
- Comments (excessive comments hiding bad code)
- Duplicate Code
- Lazy Class (class doing too little)
- Data Class (class with only getters/setters)
- Dead Code (unreachable/unused code)
- Speculative Generality (unused abstractions)

### Couplers
- Feature Envy (method uses another class more than its own)
- Inappropriate Intimacy (classes too tightly coupled)
- Message Chains (a.getB().getC().getD())
- Middle Man (class delegating everything)

## Detection Patterns for Regex-Based Analysis
- String concatenation in SQL: "SELECT.*\+.*" or sql + variable
- Hardcoded credentials: password = "...", secret = "..."
- Empty catch blocks: catch (...) { }
- System.out.println instead of logger
- Thread.sleep in production code
- synchronized blocks (potential deadlock)
- new Date() instead of java.time API
- Raw types (List instead of List<T>)
- Checked exceptions wrapping: catch(Exception e) { throw new RuntimeException(e) }
- Static mutable state: static List/Map without final
- Resource leaks: new FileInputStream without try-with-resources
- Null returns instead of Optional
- == for String comparison instead of .equals()
- Catching generic Exception instead of specific
- Magic numbers: hardcoded numeric values
- God class detection: >500 lines, >20 public methods
- Deep nesting: >3 levels of if/for/while
- Cyclomatic complexity: >10 branches per method
