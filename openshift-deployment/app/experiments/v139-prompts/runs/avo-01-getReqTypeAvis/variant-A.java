@CompleoUnvalidated(severity = "STUB", legacyRef = "SearchServiceImpl.getReqTypeAvis", migrationDate = "2026-05-12")
@Transactional
public String getReqTypeAvis() {
    // Assuming 'typeAORepository' is an injected Spring Data JPA repository for TypeAO entities
    // and 'TypeAO' is now a JPA entity.
    // If 'getListTypes()' was a method within the same service, it should be migrated as well.
    // For this example, we'll assume a direct repository call or a refactored service method.

    // Original EJB logic:
    // List<TypeAO> list = getListTypes();
    // String reqType = "";
    // for (TypeAO type : list) {
    //     reqType += type.getCode() + ",";
    // }
    // reqType = reqType.substring(0, reqType.length() - 1);
    // EaiLog.info("==============les types getReqTypeAvis()=========" + reqType);
    // return reqType;

    // Spring Boot equivalent using Java Streams for conciseness and efficiency
    // Assuming 'typeAORepository' is a Spring Data JPA repository for TypeAO.
    // You would inject this repository into your service:
    // @Autowired
    // private TypeAORepository typeAORepository;

    // If getListTypes() was a method in this service, you'd call it here:
    // List<TypeAO> list = getListTypes(); // Assuming getListTypes() is also migrated and returns a List<TypeAO>

    // For demonstration, let's assume 'typeAORepository.findAll()' is the source of TypeAO objects.
    // If 'getListTypes()' involved more complex logic (e.g., filtering, specific queries),
    // then that logic should be migrated into a dedicated method or a custom repository query.

    List<TypeAO> list = typeAORepository.findAll(); // Or call your migrated getListTypes() method

    if (list.isEmpty()) {
        // Handle the case where the list is empty. The original code would throw StringIndexOutOfBoundsException.
        // Depending on requirements, return an empty string, null, or throw a specific exception.
        // For now, returning an empty string to avoid the original error.
        log.info("==============les types getReqTypeAvis()========= (no types found)");
        return "";
    }

    String reqType = list.stream()
                         .map(TypeAO::getCode) // Assuming TypeAO has a getCode() method
                         .collect(Collectors.joining(","));

    log.info("==============les types getReqTypeAvis()=========" + reqType); // Using SLF4J logger

    return reqType;
}

// Note: You would need to define TypeAORepository and inject it into this service.
// Example:
// @Repository
// public interface TypeAORepository extends JpaRepository<TypeAO, Long> {
//     // You might add custom query methods here if 'getListTypes' had specific filtering.
// }

// And inject it into your service:
// @Service
// public class SearchServiceImpl {
//     private final TypeAORepository typeAORepository;
//     private static final Logger log = LoggerFactory.getLogger(SearchServiceImpl.class);

//     public SearchServiceImpl(TypeAORepository typeAORepository) {
//         this.typeAORepository = typeAORepository;
//     }

//     // ... your migrated method ...
// }

// Also, ensure `TypeAO` is properly defined as a JPA entity.
// The `EaiLog.info` call is replaced with a standard SLF4J logger (`log.info`).