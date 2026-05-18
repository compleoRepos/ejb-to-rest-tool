// Test the regex for multiline logger.log
const testCode = `        logger.log(Level.INFO,
                "AdminBean.createStudent(10 args): Persisting new student.");`;
console.log('Input:');
console.log(testCode);
console.log();

// Apply the regex
let result = testCode;
const levelMap: Record<string, string> = { WARNING: "warn", SEVERE: "error", INFO: "info", FINE: "debug", FINER: "trace", FINEST: "trace" };

// Pattern 2 (single line) - won't match multiline
result = result.replace(
  /\b(?:log|LOG|logger)\.log\s*\(\s*Level\.(WARNING|SEVERE|INFO|FINE|FINER|FINEST)\s*,\s*("(?:[^"\\]|\\.)*"[^)]*)\s*\)/g,
  (_, level: string, msg: string) => {
    return `log.${levelMap[level] ?? "info"}(${msg.trim()})`;
  }
);

console.log('After Pattern 2:');
console.log(result);
console.log();

// Pattern 3: Multiline
result = result.replace(
  /\b(?:log|LOG|logger)\.log\s*\(\s*Level\.(WARNING|SEVERE|INFO|FINE|FINER|FINEST)\s*,\s*\n\s*("(?:[^"\\]|\\.)*"[^)]*)\s*\)/g,
  (_, level: string, msg: string) => {
    return `log.${levelMap[level] ?? "info"}(${msg.trim()})`;
  }
);

console.log('After Pattern 3:');
console.log(result);
