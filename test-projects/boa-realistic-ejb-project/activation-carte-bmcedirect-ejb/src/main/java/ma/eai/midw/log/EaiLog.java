package ma.eai.midw.log;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Utilitaire de logging framework EAI.
 * Encapsule SLF4J avec des prefixes standardises.
 */
public class EaiLog {
    private final Logger logger;
    
    public EaiLog(Class<?> clazz) {
        this.logger = LoggerFactory.getLogger(clazz);
    }

    public void info(String message, Object... args) { logger.info("[EAI] " + message, args); }
    public void error(String message, Object... args) { logger.error("[EAI-ERR] " + message, args); }
    public void debug(String message, Object... args) { logger.debug("[EAI-DBG] " + message, args); }
    public void warn(String message, Object... args) { logger.warn("[EAI-WARN] " + message, args); }
}
