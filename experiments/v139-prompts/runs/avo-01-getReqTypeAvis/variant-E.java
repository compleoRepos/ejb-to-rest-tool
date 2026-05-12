/* MIGRATED LOGIC — from SearchServiceImpl.getReqTypeAvis */
    // Assuming getListTypes() is now a method within the same Spring component/service,
    // or injected as a dependency. For this migration, we'll assume it's available
    // and returns a List<AvisOperationType>.
    // TODO: [VERIFY] Ensure `getListTypes()` is correctly migrated and accessible.
    List<AvisOperationType> avisOperationTypes = getListTypes();

    if (avisOperationTypes == null || avisOperationTypes.isEmpty()) {
        // TODO: [VERIFY] Confirm legacy behavior for empty list.
        // The original code would throw an IndexOutOfBoundsException if the list was empty.
        // We should decide if an empty string or an exception is the desired behavior.
        // For now, returning an empty string to avoid the exception.
        return "";
    }

    // Using Java 8 Stream API for more concise and efficient string concatenation
    String transactionNotificationTypes = avisOperationTypes.stream()
        .map(AvisOperationType::getCode) // Assuming TypeAO.getCode() maps to AvisOperationType.getCode()
        .collect(Collectors.joining(","));

    // Replace legacy EaiLog.info with SLF4J (Spring's default logging facade)
    // TODO: [VERIFY] Ensure `log` is properly initialized as an SLF4J Logger.
    // Example: private static final Logger log = LoggerFactory.getLogger(YourServiceClass.class);
    log.info("==============les types getReqTypeAvis()========={}", transactionNotificationTypes);

    return transactionNotificationTypes;