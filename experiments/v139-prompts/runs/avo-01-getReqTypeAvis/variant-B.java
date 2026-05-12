List<TypeAO> list = getListTypes(); // Assuming getListTypes() is refactored elsewhere or remains a local helper.
        // If getListTypes() was an EJB call, it would be replaced by an injected Spring service call.
        // For this method's scope, we assume `getListTypes()` is either a private helper or already migrated.

        // Modern Java way to concatenate strings from a list
        String reqType = list.stream()
                             .map(TypeAO::getCode)
                             .collect(Collectors.joining(","));

        // Replace EaiLog with SLF4J logger (assuming 'log' is an injected Logger instance)
        // For example: private static final Logger log = LoggerFactory.getLogger(YourServiceClass.class);
        log.info("==============les types getReqTypeAvis()========={}", reqType);

        return reqType;