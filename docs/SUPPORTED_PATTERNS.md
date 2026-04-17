# Patterns EJB Supportes

**Version** : 3.0 | **Compleo** | Mars 2026

Ce document catalogue l'ensemble des patterns EJB reconnus par l'outil EJB-to-REST Generator et decrit leur transformation en equivalents Spring Boot.

---

## 1. Types d'EJB supportes

| Type EJB | Annotation | Transformation REST |
|----------|------------|---------------------|
| **Stateless** | `@Stateless` | Controller REST + ServiceAdapter |
| **Stateful** | `@Stateful` | Controller REST (etat non reproduit, avertissement genere) |
| **Message-Driven** | `@MessageDriven` | Controller REST async + Spring Event + EventListener |

---

## 2. Pattern BaseUseCase

### 2.1 Description

Le pattern BaseUseCase est le pattern principal de la banque. Chaque UseCase herite de `BaseUseCase<VoIn, VoOut>` et implemente une methode `execute(VoIn) → VoOut`.

### 2.2 Code source EJB

```java
@Stateless
@UseCase(name = "SimulerCredit", version = "1.0")
public class SimulerCreditUseCase extends BaseUseCase<SimulerCreditVoIn, SimulerCreditVoOut> {
    @Override
    public SimulerCreditVoOut execute(SimulerCreditVoIn input) {
        // logique metier
    }
}
```

### 2.3 Transformation generee

| Composant genere | Description |
|------------------|-------------|
| `SimulerCreditController.java` | Controller REST avec `@PostMapping` |
| `SimulerCreditServiceAdapter.java` | Adapter JNDI avec lookup et conversion DTO |
| `SimulerCreditVoIn.java` | DTO d'entree avec validation |
| `SimulerCreditVoOut.java` | DTO de sortie |

### 2.4 Detection

L'outil detecte ce pattern par :
- Heritage de `BaseUseCase`, `UCStrategie`, `SynchroneService`, `AsynchroneService`
- Presence de l'annotation `@UseCase`
- Methode `execute()` avec un parametre et un retour

---

## 3. Pattern Multi-methodes

### 3.1 Description

Un EJB expose plusieurs methodes publiques via une interface `@Remote`. Chaque methode devient un endpoint REST distinct.

### 3.2 Code source EJB

```java
@Stateless
@Remote(CompteService.class)
public class CompteServiceImpl implements CompteService {
    public CompteDto getCompte(String id) { ... }
    public List<CompteDto> listComptes(String clientId) { ... }
    public void updateCompte(CompteDto dto) { ... }
    public void deleteCompte(String id) { ... }
}
```

### 3.3 Transformation generee

| Methode EJB | Endpoint REST | HTTP |
|-------------|---------------|------|
| `getCompte(String)` | `/api/compte-service/get-compte/{id}` | GET |
| `listComptes(String)` | `/api/compte-service/list-comptes` | GET |
| `updateCompte(CompteDto)` | `/api/compte-service/update-compte` | PUT |
| `deleteCompte(String)` | `/api/compte-service/delete-compte/{id}` | DELETE |

### 3.4 Detection

- Presence de `@Remote` ou `@Local` sur la classe ou l'interface
- Plusieurs methodes publiques non-statiques
- Absence d'heritage de `BaseUseCase`

---

## 4. Pattern Message-Driven Bean (MDB)

### 4.1 Description

Les MDB ecoutent des messages JMS. L'outil les transforme en endpoints REST asynchrones avec le pattern Event/EventListener de Spring.

### 4.2 Code source EJB

```java
@MessageDriven(activationConfig = {
    @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
    @ActivationConfigProperty(propertyName = "destination", propertyValue = "queue/notifications")
})
public class NotificationMDB implements MessageListener {
    public void onMessage(Message message) { ... }
}
```

### 4.3 Transformation generee

| Composant genere | Description |
|------------------|-------------|
| `NotificationController.java` | `@PostMapping` retournant `202 Accepted` |
| `NotificationEvent.java` | Spring `ApplicationEvent` |
| `NotificationEventListener.java` | `@EventListener` + `@Async` |
| `NotificationServiceAdapter.java` | Adapter de traitement |

### 4.4 Flux d'execution

```
POST /api/notification → Controller → ApplicationEventPublisher.publishEvent()
                                          ↓ (async)
                                     EventListener → ServiceAdapter.process()
```

---

## 5. Serialisation et JAXB

### 5.1 Formats supportes

| Format | Detection | Transformation |
|--------|-----------|----------------|
| **JSON** | Par defaut | Jackson (inclus) |
| **XML** | `@XmlRootElement` detecte | JAXB (jakarta.xml.bind) + `@JacksonXmlRootElement` |
| **JSON+XML** | Negociation de contenu | `produces = {APPLICATION_JSON, APPLICATION_XML}` |

### 5.2 Annotations JAXB preservees

| Annotation source | Annotation generee |
|-------------------|--------------------|
| `@XmlRootElement` | `@XmlRootElement` + `@JacksonXmlRootElement` |
| `@XmlElement` | `@XmlElement` (avec `name` et `required` preserves) |
| `@XmlAttribute` | `@XmlAttribute` |
| `@XmlAccessorType` | `@XmlAccessorType` |
| `@XmlType` | `@XmlType` |
| `@XmlTransient` | `@XmlTransient` (champ exclu des RestDTOs en mode ACL) |
| `@XmlElementWrapper` | `@XmlElementWrapper` |

### 5.3 Migration javax → jakarta

Toutes les annotations `javax.xml.bind.*` sont automatiquement migrees vers `jakarta.xml.bind.*`.

---

## 6. Validation

### 6.1 Annotations de validation generees

| Condition | Annotation generee |
|-----------|--------------------|
| Champ String requis (`@XmlElement(required=true)`) | `@NotBlank` |
| Champ objet requis | `@NotNull` |
| Collection requise | `@NotNull` + `@Size(min = 1)` |

### 6.2 Validateurs custom

Les validateurs custom detectes dans le projet source (ex: `@ValidRIB`, `@ValidIBAN`) sont recopies dans le package `validation/` du projet genere.

---

## 7. Exceptions

### 7.1 Mapping automatique Exception → HTTP Status

| Pattern dans le nom | HTTP Status |
|---------------------|-------------|
| `notfound`, `inexistant`, `missing` | 404 Not Found |
| `unauthorized`, `nonautorise` | 401 Unauthorized |
| `forbidden`, `interdit`, `acces` | 403 Forbidden |
| `conflict`, `doublon`, `duplicate` | 409 Conflict |
| `validation`, `invalid`, `format` | 400 Bad Request |
| `timeout`, `delai` | 408 Request Timeout |
| `quota`, `limit`, `depassement` | 429 Too Many Requests |
| `unavailable`, `indisponible` | 503 Service Unavailable |
| Autre | 500 Internal Server Error |

### 7.2 GlobalExceptionHandler

Un `GlobalExceptionHandler` est genere avec un `@ExceptionHandler` pour chaque exception custom detectee, retournant le code HTTP approprie.

---

## 8. Annotations custom bancaires

### 8.1 Strategies de propagation

| Strategie | Description |
|-----------|-------------|
| `PROPAGATE_CLASS` | Annotation copiee sur la classe controller |
| `PROPAGATE_METHOD` | Annotation copiee sur chaque methode endpoint |
| `PROPAGATE_BOTH` | Annotation copiee sur la classe et les methodes |
| `TRANSFORM` | Annotation transformee en equivalent Spring |
| `COMMENT` | Annotation ajoutee en commentaire |
| `IGNORE` | Annotation ignoree |

### 8.2 Exemples de transformation

| Annotation source | Strategie | Code genere |
|-------------------|-----------|-------------|
| `@AuditLog` | PROPAGATE_METHOD | `@Audited` |
| `@ChannelRestricted("WEB")` | TRANSFORM | `@PreAuthorize("hasAuthority('CHANNEL_WEB')")` |
| `@TransactionRequired` | TRANSFORM | `@Transactional` |
| `@CacheResult(ttl=300)` | TRANSFORM | `@Cacheable(value="...", key="...")` |

---

## 9. Securite

### 9.1 @RolesAllowed → @PreAuthorize

Les annotations `@RolesAllowed` detectees sur les EJB sont transformees en `@PreAuthorize` Spring Security :

```java
// Source EJB
@RolesAllowed({"ADMIN", "MANAGER"})
public class GestionCompteUseCase extends BaseUseCase<...> { ... }

// Genere
@PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
@PostMapping("/gestion-compte")
public ResponseEntity<...> execute(...) { ... }
```

---

## 10. Enums

Les enums JAXB detectes dans le projet source sont recopies dans le package `enums/` avec migration `javax → jakarta` et ajout de `@JsonCreator` / `@JsonValue` pour la serialisation Jackson.
