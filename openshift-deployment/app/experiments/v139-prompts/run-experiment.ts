/**
 * Experiment runner — v13.9 Re-prompt LLM forcé
 * Tests 5 prompt variants on 5 representative methods
 * Uses the built-in LLM helper (invokeLLM)
 */
import { invokeLLM } from "../../server/_core/llm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const SAMPLE_DIR = path.join(__dirname, "sample-methods");
const RUNS_DIR = path.join(__dirname, "runs");

// 5 representative methods (mix of A, B, C categories)
const METHODS = [
  "icj-01-getLigneDeclicGAB",    // A - complex
  "icj-06-Traitement",           // A - very complex
  "icj-03-BlocageJoker",         // B - pass-through
  "avo-01-getReqTypeAvis",       // A - medium
  "avo-06-getListTypes",         // C - trivial
];

// --- Prompt Variants ---
function buildPromptA(legacyCode: string, targetSig: string): string {
  return `You are migrating EJB to Spring Boot. Translate this method to Spring Boot.

Legacy method:
\`\`\`java
${legacyCode}
\`\`\`

Target method signature:
\`\`\`java
${targetSig}
\`\`\`

Output only the method body code (Java).`;
}

function buildPromptB(legacyCode: string, targetSig: string): string {
  return `You are migrating a Java EE/EJB application to Spring Boot 3.x.

Below is the ORIGINAL legacy method that must be translated:

\`\`\`java
${legacyCode}
\`\`\`

And here is the TARGET Spring Boot method signature (currently a stub):

\`\`\`java
${targetSig}
\`\`\`

Your task:
1. Translate the legacy logic into modern Spring Boot code
2. Replace EJB/SOAP-specific constructs with Spring equivalents:
   - Services.find() → injected Spring @Service or @FeignClient
   - Envelope/Parser → DTO mapping or RestTemplate/WebClient
   - Log.xxx → SLF4J logger
3. Preserve all business logic (conditions, calculations, error codes)
4. Keep the same return type and error handling semantics

Output ONLY the method body (no signature, no class declaration). Java code only.`;
}

function buildPromptC(legacyCode: string, targetSig: string): string {
  return `You are migrating a legacy SOAP/EJB banking application to Spring Boot 3.x REST microservices.

## Architecture Context
- Legacy: SOAP @WebService with EJB SynchroneService calls via UDDI registry
- Target: Spring Boot 3.x with REST controllers, @Service layer, and external service calls via @FeignClient or RestTemplate
- Domain: Banking (BOA Group - Moroccan bank)
- The legacy "Envelope" XML messaging is replaced by typed DTOs
- The legacy "Services.find()" UDDI lookup is replaced by dependency injection

## Legacy Code
\`\`\`java
${legacyCode}
\`\`\`

## Target Stub (to be filled)
\`\`\`java
${targetSig}
\`\`\`

## Migration Rules
1. SOAP parameters → method parameters (keep same names)
2. Services.find() → @Autowired service (assume it exists as a Spring bean)
3. Envelope.getNodeAsString("path") → DTO getter (map XML path to field name)
4. Parser.unmarshall/marshall → not needed (DTOs are used directly)
5. Log.xxx → private static final Logger log = LoggerFactory.getLogger(...)
6. Error codes (009, 222, etc.) → preserve as-is in response DTOs
7. GenerateFlux.xxx() → assume equivalent service method exists

Output ONLY the method body (Java code). Wrap uncertain parts in /* TODO: verify */ comments.`;
}

function buildPromptD(legacyCode: string, targetSig: string, legacyRef: string): string {
  return `You are a senior Java architect performing a BEST-EFFORT migration from EJB/SOAP to Spring Boot 3.x.

## Important: This is a BEST-EFFORT translation
- The output will be reviewed by a human developer
- It is BETTER to produce imperfect but directionally correct code than to produce nothing
- Mark uncertain translations with // TODO: [VERIFY] comments
- Mark framework-dependent parts with // TODO: [FRAMEWORK-DEP] comments
- Mark business logic that needs validation with // TODO: [BUSINESS-LOGIC] comments

## Legacy Source
\`\`\`java
${legacyCode}
\`\`\`

## Target Method (currently stub)
\`\`\`java
${targetSig}
\`\`\`

## Output Format
Produce the method body with:
1. A header comment block: /* MIGRATED LOGIC — best-effort translation from ${legacyRef} */
2. The translated code with inline TODO markers for uncertain parts
3. A footer comment: /* END MIGRATED LOGIC */

## Translation Mapping
| Legacy Construct | Spring Boot Equivalent |
|-----------------|----------------------|
| Services.find(key, Class) | @Autowired dependency (assume bean exists) |
| Envelope.getNodeAsString(path) | response.getFieldName() (map path to getter) |
| Parser.unmarshall(xml) | Not needed — use DTOs directly |
| Parser.marshall(env) | Not needed — Jackson serialization |
| Log.info/error | log.info/error (SLF4J) |
| @WebParam | @RequestParam or DTO field |
| GenerateFlux.xxx() | Assume equivalent method in injected service |

Output ONLY the method body (from opening { to closing }). Java code only.`;
}

function buildPromptE(legacyCode: string, targetSig: string, legacyRef: string): string {
  return `You are migrating a Moroccan banking legacy system (BOA Group / BMCE Bank) from EJB/SOAP to Spring Boot 3.x.

## Domain Vocabulary
- DECLIC: Credit line management system
- GAB: ATM channel (Guichet Automatique Bancaire)
- TPE: POS terminal channel (Terminal de Paiement Électronique)
- Tirage: Credit drawdown
- Dossier (noDoss): Credit file/case number
- Solde: Balance
- Encours: Outstanding amount
- Impayés: Unpaid installments
- Avis Opéré: Transaction notification document
- RepDemat: Dematerialized response
- Docubase: Document management system (GED)
- Flux: XML message envelope (legacy messaging format)

## Legacy Code
\`\`\`java
${legacyCode}
\`\`\`

## Target Stub
\`\`\`java
${targetSig}
\`\`\`

## Instructions
1. Translate to Spring Boot 3.x preserving ALL business logic
2. Use the domain vocabulary above to generate meaningful variable names
3. Replace legacy framework calls with Spring equivalents
4. Preserve error codes and business validation rules exactly
5. Add // TODO: [VERIFY] for parts requiring human review
6. Wrap output in: /* MIGRATED LOGIC — from ${legacyRef} */

Output ONLY the method body (Java code).`;
}

// --- Helpers ---
function extractLegacyCode(content: string): string {
  const lines = content.split("\n");
  let inLegacy = false;
  const legacyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("# Source legacy correspondante")) {
      inLegacy = true;
      continue;
    }
    if (inLegacy && line.startsWith("# Contexte projet")) {
      break;
    }
    if (inLegacy && !line.startsWith("# Fichier") && !line.startsWith("# Méthode")) {
      legacyLines.push(line);
    }
  }
  return legacyLines.join("\n").trim();
}

function extractTargetSignature(content: string): string {
  const lines = content.split("\n");
  const sigLines: string[] = [];
  let inStub = false;
  for (const line of lines) {
    if (line.startsWith("# Méthode actuellement stub")) {
      inStub = true;
      continue;
    }
    if (inStub && line.startsWith("# Source legacy")) {
      break;
    }
    if (inStub) {
      sigLines.push(line);
    }
  }
  return sigLines.join("\n").trim();
}

function extractLegacyRef(content: string): string {
  const match = content.match(/legacyRef = "([^"]+)"/);
  return match ? match[1] : "unknown";
}

// --- Scoring ---
interface Score {
  produced_non_stub: boolean;   // Did it produce actual code (not just throw)?
  syntactically_valid: boolean; // Does it look like valid Java?
  meaningful_logic: boolean;    // Does it contain business logic (if/else, loops, etc.)?
  has_todo_markers: boolean;    // Does it have TODO markers?
  preserves_error_codes: boolean; // Does it preserve error codes from legacy?
  quality: number;              // 0-1 subjective quality score
}

function scoreOutput(output: string, legacyCode: string): Score {
  const hasThrow = output.includes("throw new") && output.includes("Exception");
  const producedNonStub = output.length > 50 && !output.includes("CompleoUnvalidatedMethodException");
  
  // Basic syntax check — has braces, semicolons, and Java-like structure
  const hasBraces = (output.match(/{/g) || []).length > 0;
  const hasSemicolons = (output.match(/;/g) || []).length > 2;
  const syntacticallyValid = hasBraces && hasSemicolons && !output.includes("```");
  
  // Meaningful logic — has conditionals, loops, or method calls
  const hasConditionals = /if\s*\(/.test(output);
  const hasLoops = /for\s*\(|while\s*\(/.test(output);
  const hasMethodCalls = /\.\w+\(/.test(output);
  const meaningfulLogic = hasConditionals || hasLoops || (hasMethodCalls && output.length > 100);
  
  // TODO markers
  const hasTodoMarkers = /TODO/.test(output);
  
  // Error codes preserved
  const legacyErrorCodes = legacyCode.match(/"(\d{3})"/g) || [];
  const preservedCodes = legacyErrorCodes.filter(code => output.includes(code));
  const preservesErrorCodes = legacyErrorCodes.length === 0 || preservedCodes.length > 0;
  
  // Quality score
  let quality = 0;
  if (producedNonStub) quality += 0.2;
  if (syntacticallyValid) quality += 0.2;
  if (meaningfulLogic) quality += 0.2;
  if (preservesErrorCodes) quality += 0.2;
  if (hasTodoMarkers) quality += 0.1;
  if (output.includes("MIGRATED LOGIC")) quality += 0.1;
  
  return {
    produced_non_stub: producedNonStub,
    syntactically_valid: syntacticallyValid,
    meaningful_logic: meaningfulLogic,
    has_todo_markers: hasTodoMarkers,
    preserves_error_codes: preservesErrorCodes,
    quality,
  };
}

// --- Main ---
async function main() {
  const results: Record<string, Record<string, { output: string; score: Score }>> = {};
  
  const variants = ["A", "B", "C", "D", "E"];
  
  for (const methodId of METHODS) {
    const filePath = path.join(SAMPLE_DIR, `${methodId}.txt`);
    const content = fs.readFileSync(filePath, "utf-8");
    const legacyCode = extractLegacyCode(content);
    const targetSig = extractTargetSignature(content);
    const legacyRef = extractLegacyRef(content);
    
    results[methodId] = {};
    
    for (const variant of variants) {
      let prompt: string;
      switch (variant) {
        case "A": prompt = buildPromptA(legacyCode, targetSig); break;
        case "B": prompt = buildPromptB(legacyCode, targetSig); break;
        case "C": prompt = buildPromptC(legacyCode, targetSig); break;
        case "D": prompt = buildPromptD(legacyCode, targetSig, legacyRef); break;
        case "E": prompt = buildPromptE(legacyCode, targetSig, legacyRef); break;
        default: prompt = buildPromptA(legacyCode, targetSig);
      }
      
      console.log(`[${methodId}][Variant ${variant}] Calling LLM...`);
      
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a senior Java architect specializing in EJB to Spring Boot migrations. Output only Java code, no markdown fences." },
            { role: "user", content: prompt },
          ],
        });
        
        const output = response.choices[0]?.message?.content || "";
        const score = scoreOutput(output, legacyCode);
        
        results[methodId][variant] = { output, score };
        
        // Save individual result
        const runDir = path.join(RUNS_DIR, methodId);
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(
          path.join(runDir, `variant-${variant}.java`),
          output
        );
        fs.writeFileSync(
          path.join(runDir, `variant-${variant}-score.json`),
          JSON.stringify(score, null, 2)
        );
        
        console.log(`  → Score: quality=${score.quality.toFixed(2)}, non_stub=${score.produced_non_stub}, valid=${score.syntactically_valid}, logic=${score.meaningful_logic}`);
      } catch (err: any) {
        console.error(`  → ERROR: ${err.message}`);
        results[methodId][variant] = {
          output: `ERROR: ${err.message}`,
          score: { produced_non_stub: false, syntactically_valid: false, meaningful_logic: false, has_todo_markers: false, preserves_error_codes: false, quality: 0 },
        };
      }
    }
  }
  
  // --- Aggregate Results ---
  console.log("\n\n=== AGGREGATE RESULTS ===\n");
  
  const variantScores: Record<string, { total_quality: number; non_stub: number; valid: number; logic: number; count: number }> = {};
  
  for (const variant of variants) {
    variantScores[variant] = { total_quality: 0, non_stub: 0, valid: 0, logic: 0, count: 0 };
    
    for (const methodId of METHODS) {
      const r = results[methodId][variant];
      if (r) {
        variantScores[variant].total_quality += r.score.quality;
        variantScores[variant].non_stub += r.score.produced_non_stub ? 1 : 0;
        variantScores[variant].valid += r.score.syntactically_valid ? 1 : 0;
        variantScores[variant].logic += r.score.meaningful_logic ? 1 : 0;
        variantScores[variant].count++;
      }
    }
  }
  
  console.log("Variant | Avg Quality | Non-Stub Rate | Valid Rate | Logic Rate | VIABLE?");
  console.log("--------|-------------|---------------|------------|------------|--------");
  
  for (const variant of variants) {
    const s = variantScores[variant];
    const n = s.count || 1;
    const avgQuality = s.total_quality / n;
    const nonStubRate = s.non_stub / n;
    const validRate = s.valid / n;
    const logicRate = s.logic / n;
    const viable = nonStubRate >= 0.5 && validRate >= 0.9 && logicRate >= 0.3 && avgQuality >= 0.4;
    
    console.log(`   ${variant}    |    ${avgQuality.toFixed(2)}     |     ${nonStubRate.toFixed(2)}      |    ${validRate.toFixed(2)}    |    ${logicRate.toFixed(2)}    |  ${viable ? "YES" : "NO"}`);
  }
  
  // Save summary
  fs.writeFileSync(
    path.join(RUNS_DIR, "summary.json"),
    JSON.stringify({ methods: METHODS, variants, results: variantScores }, null, 2)
  );
  
  console.log("\nDone. Results saved to experiments/v139-prompts/runs/");
}

main().catch(console.error);
