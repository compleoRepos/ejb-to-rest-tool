/*
 * Migration of SearchServiceImpl.getReqTypeAvis
 *
 * Legacy description: This method retrieves a list of 'TypeAO' objects and concatenates their codes into a single comma-separated string.
 *
 * Migration steps:
 * 1. Identify the source of 'TypeAO' list. In the legacy code, it's `getListTypes()`.
 *    Assuming `getListTypes()` is another method within the same service or a dependency.
 *    For now, we'll assume `typeAOService` is responsible for fetching these types.
 * 2. Replace the direct call to `getListTypes()` with an injected Spring service call.
 * 3. Replicate the string concatenation logic.
 * 4. Replace legacy logging with SLF4J.
 *
 * Dependencies to be injected into the class containing this method:
 * - private final TypeAOService typeAOService; // Assuming TypeAOService provides the list of TypeAO
 */

    // Assuming TypeAOService is injected into the containing class, e.g.:
    // @Autowired
    // private TypeAOService typeAOService;
    // private static final Logger log = LoggerFactory.getLogger(SearchServiceImpl.class); // Or the appropriate class name

    List<TypeAO> typeAOs = /* TODO: Verify the actual service call for getting TypeAO list */ typeAOService.getAllTypeAOs(); // Assuming TypeAOService provides a method to get all TypeAO objects.

    if (typeAOs == null || typeAOs.isEmpty()) {
        log.warn("No TypeAO objects found when calling getReqTypeAvis.");
        return ""; // Or handle as per business requirement, e.g., throw an exception
    }

    StringBuilder reqTypeBuilder = new StringBuilder();
    for (TypeAO type : typeAOs) {
        if (type != null && type.getCode() != null) {
            reqTypeBuilder.append(type.getCode()).append(",");
        }
    }

    String reqType;
    if (reqTypeBuilder.length() > 0) {
        reqType = reqTypeBuilder.substring(0, reqTypeBuilder.length() - 1);
    } else {
        reqType = "";
    }

    log.info("==============les types getReqTypeAvis()========={}", reqType);
    return reqType;