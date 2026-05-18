/**
 * Logger structuré — Compleo v10.4
 *
 * Remplace les console.log éparpillés par un logger contextuel.
 * Format : [HH:MM:SS.mmm] [LEVEL] [Context] message {data}
 *
 * @author Compleo
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, data?: Record<string, any>) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const color = LOG_COLORS[level];
    const dataStr = data ? " " + JSON.stringify(data) : "";
    const line = `${color}[${timestamp}] [${level.toUpperCase()}] [${this.context}]${RESET} ${message}${dataStr}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(msg: string, data?: Record<string, any>) {
    this.log("debug", msg, data);
  }
  info(msg: string, data?: Record<string, any>) {
    this.log("info", msg, data);
  }
  warn(msg: string, data?: Record<string, any>) {
    this.log("warn", msg, data);
  }
  error(msg: string, data?: Record<string, any>) {
    this.log("error", msg, data);
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
