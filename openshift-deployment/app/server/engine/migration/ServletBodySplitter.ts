/**
 * ServletBodySplitter — v12.3
 * 
 * Sépare les corps de méthodes Servlet (doGet/doPost) en 3 zones :
 *   Zone 1 — Extraction params (→ Controller @RequestParam)
 *   Zone 2 — Logique métier (→ Service method body)
 *   Zone 3 — Réponse HTTP (→ Controller return)
 * 
 * Heuristique : si le body a ≤ 15 lignes utiles et utilise uniquement
 * getParameter + JDBC/EntityManager + sendRedirect → migrable automatiquement.
 * Sinon → garder le TODO (login flows, wizards multi-étapes).
 */

export interface SplitResult {
  /** true si la migration automatique est possible */
  canMigrate: boolean;
  /** Raison si canMigrate = false */
  reason?: string;
  /** Code du Controller généré */
  controllerCode: string;
  /** Code du Service généré */
  serviceCode: string;
  /** Paramètres extraits pour la signature du Controller */
  params: ExtractedParam[];
  /** Type de retour du Controller */
  returnType: string;
}

export interface ExtractedParam {
  name: string;
  type: string;
  source: 'request' | 'session' | 'path';
}

interface SplitZones {
  paramLines: string[];
  logicLines: string[];
  responseLines: string[];
  imports: string[];
}

// Patterns qui rendent la migration trop risquée
const COMPLEX_PATTERNS = [
  /request\.getRequestDispatcher.*forward/,
  /session\.setAttribute.*("user"|"login"|"auth")/i,
  /response\.sendRedirect.*login/i,
  /RequestDispatcher/,
  /pageContext/,
  /include\s*\(/,
  /getServletContext/,
  /multipart/i,
  /Part\s+/,
  /HttpSession.*invalidate/,
];

// Patterns Zone 1 — extraction de paramètres
const PARAM_PATTERNS = [
  { regex: /(\w+)\s*=\s*request\.getParameter\s*\(\s*"([^"]+)"\s*\)/, source: 'request' as const },
  { regex: /(\w+)\s*=\s*request\.getAttribute\s*\(\s*"([^"]+)"\s*\)/, source: 'request' as const },
  { regex: /(\w+)\s*=\s*\(.*?\)\s*session\.getAttribute\s*\(\s*"([^"]+)"\s*\)/, source: 'session' as const },
  { regex: /(\w+)\s*=\s*session\.getAttribute\s*\(\s*"([^"]+)"\s*\)/, source: 'session' as const },
];

// Patterns Zone 3 — réponse HTTP
const RESPONSE_PATTERNS = [
  /response\.sendRedirect/,
  /response\.getWriter\(\)/,
  /response\.setContentType/,
  /response\.setStatus/,
  /response\.sendError/,
  /out\.print/,
  /out\.write/,
  /out\.flush/,
  /out\.close/,
];

/**
 * Sépare un corps de méthode Servlet en 3 zones.
 */
export function splitServletBody(
  body: string,
  methodName: string,
  className: string
): SplitResult {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
  
  // Vérifier la complexité
  if (lines.length > 15) {
    return {
      canMigrate: false,
      reason: `Body trop long (${lines.length} lignes) — migration manuelle recommandée`,
      controllerCode: '',
      serviceCode: '',
      params: [],
      returnType: 'void',
    };
  }

  // Vérifier les patterns complexes
  for (const pattern of COMPLEX_PATTERNS) {
    const matchingLine = lines.find(l => pattern.test(l));
    if (matchingLine) {
      return {
        canMigrate: false,
        reason: `Pattern complexe détecté: ${pattern.source} — migration manuelle recommandée`,
        controllerCode: '',
        serviceCode: '',
        params: [],
        returnType: 'void',
      };
    }
  }

  // Séparer en zones
  const zones = classifyLines(lines);
  
  // Extraire les paramètres
  const params = extractParams(zones.paramLines);
  
  // Déterminer le type de retour
  const returnType = determineReturnType(zones.responseLines);
  
  // Générer le code Controller
  const controllerCode = generateControllerCode(methodName, className, params, zones.responseLines, returnType);
  
  // Générer le code Service
  const serviceCode = generateServiceCode(methodName, params, zones.logicLines);
  
  return {
    canMigrate: true,
    controllerCode,
    serviceCode,
    params,
    returnType,
  };
}

function classifyLines(lines: string[]): SplitZones {
  const paramLines: string[] = [];
  const logicLines: string[] = [];
  const responseLines: string[] = [];
  const imports: string[] = [];

  for (const line of lines) {
    if (line.startsWith('import ')) {
      imports.push(line);
      continue;
    }

    let isParam = false;
    for (const p of PARAM_PATTERNS) {
      if (p.regex.test(line)) {
        paramLines.push(line);
        isParam = true;
        break;
      }
    }
    if (isParam) continue;

    let isResponse = false;
    for (const r of RESPONSE_PATTERNS) {
      if (r.test(line)) {
        responseLines.push(line);
        isResponse = true;
        break;
      }
    }
    if (isResponse) continue;

    // Tout le reste → logique métier
    logicLines.push(line);
  }

  return { paramLines, logicLines, responseLines, imports };
}

function extractParams(paramLines: string[]): ExtractedParam[] {
  const params: ExtractedParam[] = [];
  
  for (const line of paramLines) {
    for (const p of PARAM_PATTERNS) {
      const match = line.match(p.regex);
      if (match) {
        const varName = match[1];
        const type = inferTypeFromLine(line, varName);
        params.push({ name: varName, type, source: p.source });
        break;
      }
    }
  }
  
  return params;
}

function inferTypeFromLine(line: string, varName: string): string {
  // Détecter le type depuis le cast ou la conversion
  if (/new\s+BigDecimal/.test(line)) return 'BigDecimal';
  if (/Integer\.parseInt|Integer\.valueOf/.test(line)) return 'int';
  if (/Long\.parseLong|Long\.valueOf/.test(line)) return 'Long';
  if (/Double\.parseDouble/.test(line)) return 'double';
  if (/Boolean\.parseBoolean/.test(line)) return 'boolean';
  if (/\(int\)/.test(line)) return 'int';
  if (/\(long\)/.test(line)) return 'Long';
  if (/\(Long\)/.test(line)) return 'Long';
  if (/\(Integer\)/.test(line)) return 'Integer';
  
  // Par défaut → String
  return 'String';
}

function determineReturnType(responseLines: string[]): string {
  for (const line of responseLines) {
    if (/response\.sendRedirect/.test(line)) return 'ResponseEntity<Void>';
    if (/response\.getWriter.*print.*json|response\.setContentType.*json/i.test(line)) return 'ResponseEntity<Object>';
    if (/response\.getWriter/.test(line)) return 'ResponseEntity<String>';
    if (/response\.sendError/.test(line)) return 'ResponseEntity<Void>';
  }
  return 'ResponseEntity<Void>';
}

function generateControllerCode(
  methodName: string,
  className: string,
  params: ExtractedParam[],
  responseLines: string[],
  returnType: string
): string {
  const httpMethod = methodName === 'doPost' ? 'Post' : 'Get';
  const endpoint = classNameToEndpoint(className);
  const serviceName = classNameToServiceName(className);
  const serviceMethod = classNameToMethodName(className);
  
  const paramAnnotations = params.map(p => {
    const annotation = p.source === 'session' ? '@SessionAttribute' : '@RequestParam';
    return `${annotation} ${p.type} ${p.name}`;
  }).join(', ');

  const serviceCall = params.length > 0
    ? `${serviceName}.${serviceMethod}(${params.map(p => p.name).join(', ')});`
    : `${serviceName}.${serviceMethod}();`;

  const returnStatement = generateReturnStatement(responseLines, returnType);

  return `    @${httpMethod}Mapping("${endpoint}")
    public ${returnType} ${serviceMethod}(${paramAnnotations}) {
        ${serviceCall}
        ${returnStatement}
    }`;
}

function generateServiceCode(
  methodName: string,
  params: ExtractedParam[],
  logicLines: string[]
): string {
  // Transformer les lignes JDBC en appels repository
  const transformedLines = transformJdbcToRepository(logicLines);
  
  const paramList = params.map(p => `${p.type} ${p.name}`).join(', ');
  
  return `    @Transactional
    public void execute(${paramList}) {
${transformedLines.map(l => `        ${l}`).join('\n')}
    }`;
}

function transformJdbcToRepository(lines: string[]): string[] {
  const result: string[] = [];
  let skipConnection = false;

  for (const line of lines) {
    // Ignorer les lignes de connexion JDBC
    if (/Connection\s+\w+\s*=|DriverManager\.getConnection|DataSource/.test(line)) {
      skipConnection = true;
      continue;
    }
    if (/PreparedStatement\s+\w+\s*=/.test(line)) continue;
    if (/\.setString\(|\.setInt\(|\.setLong\(|\.setBigDecimal\(|\.setDate\(/.test(line)) continue;
    if (/ResultSet\s+\w+\s*=/.test(line)) continue;
    if (/\.close\(\)/.test(line)) continue;
    if (/try\s*\{|catch\s*\(|finally\s*\{|\}/.test(line) && line.length < 20) continue;

    // Transformer les executeUpdate en repository.save()
    if (/\.executeUpdate\(\)/.test(line)) {
      result.push('// TODO: Replace with repository.save(entity)');
      continue;
    }
    
    // Transformer les executeQuery en repository.find*()
    if (/\.executeQuery\(\)/.test(line)) {
      result.push('// TODO: Replace with repository.findBy*(param)');
      continue;
    }

    // Garder les lignes de logique métier
    if (line.trim().length > 0) {
      result.push(line);
    }
  }

  // Si aucune ligne de logique, ajouter un commentaire
  if (result.length === 0) {
    result.push('// Business logic migrated from Servlet');
  }

  return result;
}

function generateReturnStatement(responseLines: string[], returnType: string): string {
  for (const line of responseLines) {
    if (/response\.sendRedirect\s*\(\s*"([^"]+)"/.test(line)) {
      return 'return ResponseEntity.ok().build();';
    }
    if (/response\.getWriter\(\)\.print/.test(line)) {
      return 'return ResponseEntity.ok(result);';
    }
  }
  return 'return ResponseEntity.ok().build();';
}

function classNameToEndpoint(className: string): string {
  // depositServlet → /deposit, createCustomerServlet → /create-customer
  const name = className
    .replace(/Servlet$/i, '')
    .replace(/Service$/i, '')
    .replace(/Controller$/i, '');
  return '/' + name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function classNameToServiceName(className: string): string {
  const name = className
    .replace(/Servlet$/i, '')
    .replace(/Controller$/i, '');
  return name.charAt(0).toLowerCase() + name.slice(1) + 'Service';
}

function classNameToMethodName(className: string): string {
  const name = className
    .replace(/Servlet$/i, '')
    .replace(/Service$/i, '')
    .replace(/Controller$/i, '');
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Vérifie si un corps de méthode Servlet est migrable automatiquement.
 */
export function isServletBodyMigrable(body: string): boolean {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
  
  if (lines.length > 15) return false;
  
  for (const pattern of COMPLEX_PATTERNS) {
    if (lines.some(l => pattern.test(l))) return false;
  }
  
  return true;
}
