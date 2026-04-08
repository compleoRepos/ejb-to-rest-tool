package ma.bmce.core.framework;

import java.util.logging.Logger;

public class EaiLog {
    private static final Logger logger = Logger.getLogger("EAI");

    public static void info(String code, String message) {
        logger.info("[" + code + "] " + message);
    }

    public static void error(String code, String message, Throwable t) {
        logger.severe("[" + code + "] " + message + " - " + t.getMessage());
    }

    public static void debug(String code, String message) {
        logger.fine("[" + code + "] " + message);
    }
}
