/**
 * FrameworkReplacer.ts — v12.5
 * Remplace les références aux frameworks internes (AppLog, EaiLog, PlatformRollbackException, etc.)
 * par leurs équivalents Spring/standard dans les fichiers générés.
 *
 * Patterns traités :
 * - AppLog.info/warn/error/debug → log.info/warn/error/debug (SLF4J)
 * - EaiLog.info/warn/error/debug → log.info/warn/error/debug (SLF4J)
 * - PlatformRollbackException → RuntimeException (ou custom)
 * - ServiceStrategie → interface Spring
 * - SessionContext.setRollbackOnly() → TransactionAspectSupport
 *
 * @author Compleo
 */

export interface FrameworkReplacerStats {
  appLogReplaced: number;
  platformExceptionReplaced: number;
  setRollbackOnlyReplaced: number;
  totalReplacements: number;
  filesModified: number;
}

interface ReplacementRule {
  /** Regex to match in the source */
  pattern: RegExp;
  /** Replacement string (can use $1, $2 etc.) */
  replacement: string;
  /** Category for stats */
  category: 'appLog' | 'platformException' | 'setRollbackOnly' | 'other';
  /** Import to add if replacement is used */
  requiredImport?: string;
}

const REPLACEMENT_RULES: ReplacementRule[] = [
  // ─── AppLog / EaiLog → SLF4J ─────────────────────────────────────────────
  {
    pattern: /AppLog\.(info|warn|error|debug)\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]+)\s*\)/g,
    replacement: 'log.$1($2)',
    category: 'appLog',
    requiredImport: 'import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;',
  },
  {
    pattern: /EaiLog\.(info|warn|error|debug)\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]+)\s*\)/g,
    replacement: 'log.$1($2)',
    category: 'appLog',
    requiredImport: 'import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;',
  },
  {
    pattern: /AppLog\.(trace|fatal)\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]+)\s*\)/g,
    replacement: 'log.info($2)',
    category: 'appLog',
    requiredImport: 'import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;',
  },
  {
    pattern: /EaiLog\.(trace|fatal)\s*\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]+)\s*\)/g,
    replacement: 'log.info($2)',
    category: 'appLog',
    requiredImport: 'import org.slf4j.Logger;\nimport org.slf4j.LoggerFactory;',
  },
  // ─── AppLog/EaiLog initialization calls → remove entirely (v12.5) ────────
  {
    pattern: /\s*AppLog\.initTrace\s*\([^)]*\)\s*;\s*\n?/g,
    replacement: '\n',
    category: 'appLog',
  },
  {
    pattern: /\s*AppLog\.init\w*\s*\([^)]*\)\s*;\s*\n?/g,
    replacement: '\n',
    category: 'appLog',
  },
  {
    pattern: /\s*EaiLog\.initLogTraceInfos\s*\([^)]*\)\s*;\s*\n?/g,
    replacement: '\n',
    category: 'appLog',
  },
  {
    pattern: /\s*EaiLog\.setNewThreadId\s*\(\s*\)\s*;\s*\n?/g,
    replacement: '\n',
    category: 'appLog',
  },
  // Remove old imports
  {
    pattern: /import\s+[\w.]*\.AppLog\s*;\s*\n?/g,
    replacement: '',
    category: 'appLog',
  },
  {
    pattern: /import\s+[\w.]*\.EaiLog\s*;\s*\n?/g,
    replacement: '',
    category: 'appLog',
  },

  // ─── PlatformRollbackException → RuntimeException ─────────────────────────
  {
    pattern: /PlatformRollbackException/g,
    replacement: 'BusinessException',
    category: 'platformException',
  },
  {
    pattern: /import\s+[\w.]*\.PlatformRollbackException\s*;\s*\n?/g,
    replacement: '',
    category: 'platformException',
  },

  // ─── setRollbackOnly() → TransactionAspectSupport ─────────────────────────
  {
    pattern: /(?:sessionContext|ctx|context|sctx)\s*\.\s*setRollbackOnly\s*\(\s*\)/g,
    replacement: 'TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()',
    category: 'setRollbackOnly',
    requiredImport: 'import org.springframework.transaction.interceptor.TransactionAspectSupport;',
  },
  // v12.5: Also match standalone setRollbackOnly() calls (without qualifier)
  {
    pattern: /(?:this\.)?setRollbackOnly\s*\(\s*\)/g,
    replacement: 'TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()',
    category: 'setRollbackOnly',
    requiredImport: 'import org.springframework.transaction.interceptor.TransactionAspectSupport;',
  },
  {
    pattern: /import\s+javax\.ejb\.SessionContext\s*;\s*\n?/g,
    replacement: '',
    category: 'setRollbackOnly',
  },
  // Remove @Resource SessionContext field declarations
  {
    pattern: /\s*@Resource\s+(?:private\s+)?SessionContext\s+\w+\s*;\s*\n?/g,
    replacement: '\n',
    category: 'setRollbackOnly',
  },
  // v12.5: Remove @Inject SessionContext fields
  {
    pattern: /\s*@Inject\s+(?:private\s+)?SessionContext\s+\w+\s*;\s*\n?/g,
    replacement: '\n',
    category: 'setRollbackOnly',
  },

  // ─── @Schedule → @Scheduled (v12.5) ───────────────────────────────────────
  {
    pattern: /@Schedule\s*\(\s*hour\s*=\s*"(\d+)"\s*,\s*minute\s*=\s*"(\d+)"\s*(?:,\s*second\s*=\s*"(\d+)")?\s*\)/g,
    replacement: '@Scheduled(cron = "0 $2 $1 * * *")',
    category: 'other',
    requiredImport: 'import org.springframework.scheduling.annotation.Scheduled;',
  },
  {
    pattern: /@Schedule\s*\([^)]*\)/g,
    replacement: '@Scheduled(fixedDelay = 60000)',
    category: 'other',
    requiredImport: 'import org.springframework.scheduling.annotation.Scheduled;',
  },
  {
    pattern: /import\s+javax\.ejb\.Schedule\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /import\s+javax\.ejb\.Timer\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },

  // ─── JMS raw API → Spring JmsTemplate/KafkaTemplate (v12.5) ───────────────
  {
    pattern: /ConnectionFactory\s+\w+\s*=\s*[^;]+;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /Connection\s+\w+\s*=\s*\w+\.createConnection\([^)]*\)\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /Session\s+\w+\s*=\s*\w+\.createSession\([^)]*\)\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /MessageProducer\s+\w+\s*=\s*[^;]+;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /(\w+)\.send\s*\(\s*(\w+)\.createTextMessage\s*\(([^)]+)\)\s*\)/g,
    replacement: 'jmsTemplate.convertAndSend(destinationName, $3)',
    category: 'other',
    requiredImport: 'import org.springframework.jms.core.JmsTemplate;',
  },
  {
    pattern: /import\s+javax\.jms\.[\w*]+\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
  {
    pattern: /import\s+jakarta\.jms\.[\w*]+\s*;\s*\n?/g,
    replacement: '',
    category: 'other',
  },
];

/**
 * Apply framework replacements to a single file content.
 * Returns the modified content and stats.
 */
function applyReplacements(content: string, className: string): {
  content: string;
  stats: { appLog: number; platformException: number; setRollbackOnly: number; other: number };
  importsNeeded: Set<string>;
} {
  const stats = { appLog: 0, platformException: 0, setRollbackOnly: 0, other: 0 };
  const importsNeeded = new Set<string>();
  let modified = content;

  for (const rule of REPLACEMENT_RULES) {
    const matches = modified.match(rule.pattern);
    if (matches && matches.length > 0) {
      modified = modified.replace(rule.pattern, rule.replacement);
      stats[rule.category] += matches.length;
      if (rule.requiredImport) {
        importsNeeded.add(rule.requiredImport);
      }
    }
  }

  // Add SLF4J logger field if AppLog/EaiLog was replaced
  if (stats.appLog > 0 && !modified.includes('LoggerFactory.getLogger')) {
    // Add logger field after class declaration
    const classDecl = modified.match(/(public\s+class\s+\w+[^{]*\{)/);
    if (classDecl) {
      const loggerField = `\n    private static final Logger log = LoggerFactory.getLogger(${className}.class);\n`;
      modified = modified.replace(classDecl[1], classDecl[1] + loggerField);
    }
  }

  // Add required imports at the top (after package declaration)
  if (importsNeeded.size > 0) {
    const importBlock = [...importsNeeded].join('\n') + '\n';
    const packageMatch = modified.match(/(package\s+[\w.]+\s*;\s*\n)/);
    if (packageMatch) {
      modified = modified.replace(packageMatch[1], packageMatch[1] + importBlock);
    } else {
      modified = importBlock + modified;
    }
  }

  return { content: modified, stats, importsNeeded };
}

/**
 * Run framework replacements on all generated files.
 */
export function runFrameworkReplacements(
  files: Array<{ path: string; content: string; technology?: string }>
): {
  files: Array<{ path: string; content: string; technology?: string }>;
  stats: FrameworkReplacerStats;
} {
  const globalStats: FrameworkReplacerStats = {
    appLogReplaced: 0,
    platformExceptionReplaced: 0,
    setRollbackOnlyReplaced: 0,
    totalReplacements: 0,
    filesModified: 0,
  };

  const modifiedFiles = files.map(file => {
    // Only process Java files
    if (!file.path.endsWith('.java')) return file;

    // Extract className from path
    const className = file.path.split('/').pop()?.replace('.java', '') || 'Unknown';

    const result = applyReplacements(file.content, className);
    const totalForFile = result.stats.appLog + result.stats.platformException + result.stats.setRollbackOnly + result.stats.other;

    if (totalForFile > 0) {
      globalStats.appLogReplaced += result.stats.appLog;
      globalStats.platformExceptionReplaced += result.stats.platformException;
      globalStats.setRollbackOnlyReplaced += result.stats.setRollbackOnly;
      globalStats.totalReplacements += totalForFile;
      globalStats.filesModified++;
      return { ...file, content: result.content };
    }

    return file;
  });

  return { files: modifiedFiles, stats: globalStats };
}
