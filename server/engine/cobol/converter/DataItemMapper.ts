/**
 * DataItemMapper.ts — COBOL PIC → Java type mapping
 * Converts COBOL PICTURE clauses to appropriate Java types.
 *
 * Rules:
 *   PIC 9(n)         → int (n≤9), long (n≤18), BigDecimal (n>18)
 *   PIC 9(n)V9(m)    → BigDecimal
 *   PIC S9(n)        → int/long (signed)
 *   PIC X(n)         → String
 *   PIC A(n)         → String
 *   COMP / COMP-3    → int/long/BigDecimal
 *   COMP-1           → float
 *   COMP-2           → double
 *   88-level         → boolean constant
 *   GROUP item       → inner class / DTO
 *
 * @author Compleo v11.1
 */

export interface JavaField {
  name: string;
  javaType: string;
  nullable: boolean;
  length?: number;
  scale?: number;
  comment?: string;
  defaultValue?: string;
  isGroup: boolean;
  children?: JavaField[];
  originalPic?: string;
  level: number;
}

export interface MappingResult {
  fields: JavaField[];
  imports: Set<string>;
  warnings: string[];
}

// ─── PIC Pattern Parsing ────────────────────────────────────────────────────

interface PicInfo {
  type: "numeric" | "alphanumeric" | "alphabetic" | "edited";
  totalDigits: number;
  decimalDigits: number;
  signed: boolean;
  usage?: string;
}

/**
 * Parse a COBOL PIC clause into structured info.
 * Examples:
 *   "9(5)"       → { type: numeric, totalDigits: 5, decimalDigits: 0, signed: false }
 *   "S9(7)V9(2)" → { type: numeric, totalDigits: 9, decimalDigits: 2, signed: true }
 *   "X(30)"      → { type: alphanumeric, totalDigits: 30, decimalDigits: 0, signed: false }
 */
export function parsePicClause(pic: string): PicInfo {
  const normalized = pic.toUpperCase().replace(/\s+/g, "");

  // Alphabetic
  if (/^A/.test(normalized)) {
    const len = expandPicLength(normalized, "A");
    return { type: "alphabetic", totalDigits: len, decimalDigits: 0, signed: false };
  }

  // Edited (contains Z, *, $, +, -, ., ,, B, 0, /)
  if (/[Z*$+\-.,B\/]/.test(normalized.replace(/^S/, ""))) {
    const len = normalized.replace(/[^9XAZB0]/g, "").length || expandPicLength(normalized, "9");
    return { type: "edited", totalDigits: len, decimalDigits: 0, signed: normalized.startsWith("S") };
  }

  // Alphanumeric
  if (/^X/.test(normalized) || /9.*X|X.*9/.test(normalized)) {
    const len = expandPicLength(normalized, "X");
    return { type: "alphanumeric", totalDigits: len, decimalDigits: 0, signed: false };
  }

  // Numeric
  const signed = normalized.startsWith("S");
  const body = signed ? normalized.slice(1) : normalized;

  // Split on V (implied decimal)
  const vParts = body.split("V");
  const intPart = vParts[0] || "";
  const decPart = vParts[1] || "";

  const intDigits = expandPicLength(intPart, "9");
  const decDigits = decPart ? expandPicLength(decPart, "9") : 0;

  return {
    type: "numeric",
    totalDigits: intDigits + decDigits,
    decimalDigits: decDigits,
    signed,
  };
}

/**
 * Expand PIC repetition notation: 9(5) → 5, XXX → 3, 9(3)9(2) → 5
 */
function expandPicLength(picPart: string, charType: string): number {
  let total = 0;
  // Match repeated notation: X(5), 9(3), A(10)
  const repeatRegex = new RegExp(`${charType}\\((\\d+)\\)`, "gi");
  let match: RegExpExecArray | null;
  let processed = picPart;

  while ((match = repeatRegex.exec(picPart)) !== null) {
    total += parseInt(match[1], 10);
    processed = processed.replace(match[0], "");
  }

  // Count remaining individual characters
  const singleRegex = new RegExp(charType, "gi");
  const singles = processed.match(singleRegex);
  if (singles) total += singles.length;

  return total || 1;
}

// ─── Type Mapping ───────────────────────────────────────────────────────────

/**
 * Map a PIC clause + USAGE to a Java type.
 */
export function mapPicToJavaType(pic: string, usage?: string): { javaType: string; imports: string[] } {
  // COMP-1 → float
  if (usage === "COMP-1" || usage === "COMPUTATIONAL-1") {
    return { javaType: "float", imports: [] };
  }
  // COMP-2 → double
  if (usage === "COMP-2" || usage === "COMPUTATIONAL-2") {
    return { javaType: "double", imports: [] };
  }

  const info = parsePicClause(pic);

  switch (info.type) {
    case "alphabetic":
    case "alphanumeric":
    case "edited":
      return { javaType: "String", imports: [] };

    case "numeric":
      if (info.decimalDigits > 0) {
        return { javaType: "BigDecimal", imports: ["java.math.BigDecimal"] };
      }
      if (info.totalDigits <= 9) {
        return { javaType: "int", imports: [] };
      }
      if (info.totalDigits <= 18) {
        return { javaType: "long", imports: [] };
      }
      return { javaType: "BigDecimal", imports: ["java.math.BigDecimal"] };
  }
}

// ─── Name Conversion ────────────────────────────────────────────────────────

/**
 * Convert COBOL data name to Java field name (camelCase).
 * WS-CUSTOMER-NAME → customerName
 * ACCT-BALANCE     → acctBalance
 * 88-ACTIVE-FLAG   → activeFlag (strip level prefix)
 */
export function cobolNameToJava(cobolName: string): string {
  // Remove common prefixes
  let name = cobolName
    .replace(/^(WS-|LS-|LK-|FD-|SD-|RD-|CD-|WA-|WK-|DC-|DM-|IO-)/, "")
    .replace(/^[0-9]+-/, ""); // Remove level number prefixes like "88-"

  // Split on hyphens and convert to camelCase
  const parts = name.split("-").filter(Boolean);
  if (parts.length === 0) return "field";

  return parts
    .map((part, i) => {
      const lower = part.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/**
 * Convert COBOL data name to Java class name (PascalCase).
 * WS-CUSTOMER-RECORD → CustomerRecord
 */
export function cobolNameToClassName(cobolName: string): string {
  let name = cobolName.replace(/^(WS-|LS-|LK-|FD-|SD-|RD-|CD-|WA-|WK-)/, "");
  const parts = name.split("-").filter(Boolean);
  if (parts.length === 0) return "CobolDto";

  return parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

// ─── Full Mapping ───────────────────────────────────────────────────────────

export interface CobolDataItem {
  level: number;
  name: string;
  pic?: string;
  usage?: string;
  value?: string;
  occurs?: number;
  redefines?: string;
}

/**
 * Map a list of COBOL data items (from WORKING-STORAGE or LINKAGE) to Java fields.
 * Handles GROUP items (no PIC) by creating nested structures.
 */
export function mapDataItems(items: CobolDataItem[]): MappingResult {
  const fields: JavaField[] = [];
  const imports = new Set<string>();
  const warnings: string[] = [];

  const stack: { level: number; field: JavaField }[] = [];

  for (const item of items) {
    // Skip FILLER
    if (item.name === "FILLER" || item.name === "FILLER-X") continue;

    // 88-level → boolean constant (skip for now, add as comment)
    if (item.level === 88) {
      if (stack.length > 0) {
        const parent = stack[stack.length - 1].field;
        parent.comment = (parent.comment || "") + ` [88: ${item.name}=${item.value}]`;
      }
      continue;
    }

    // Determine if GROUP (no PIC) or ELEMENTARY (has PIC)
    const isGroup = !item.pic;

    let javaType = "Object";
    let nullable = false;
    let length: number | undefined;
    let scale: number | undefined;

    if (item.pic) {
      const mapping = mapPicToJavaType(item.pic, item.usage);
      javaType = mapping.javaType;
      mapping.imports.forEach(i => imports.add(i));

      const picInfo = parsePicClause(item.pic);
      length = picInfo.totalDigits;
      scale = picInfo.decimalDigits > 0 ? picInfo.decimalDigits : undefined;
      nullable = javaType === "String" || javaType === "BigDecimal";
    } else {
      // GROUP item → inner class
      javaType = cobolNameToClassName(item.name);
    }

    // Handle OCCURS (arrays)
    if (item.occurs && item.occurs > 1) {
      javaType = `List<${javaType === "int" ? "Integer" : javaType === "long" ? "Long" : javaType === "float" ? "Float" : javaType === "double" ? "Double" : javaType}>`;
      imports.add("java.util.List");
      imports.add("java.util.ArrayList");
    }

    const field: JavaField = {
      name: cobolNameToJava(item.name),
      javaType,
      nullable,
      length,
      scale,
      comment: item.redefines ? `REDEFINES ${item.redefines}` : undefined,
      defaultValue: item.value && !item.pic ? undefined : mapDefaultValue(item.value, javaType),
      isGroup,
      children: isGroup ? [] : undefined,
      originalPic: item.pic,
      level: item.level,
    };

    // Pop stack until we find the parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      // Add as child of parent GROUP
      const parent = stack[stack.length - 1].field;
      if (parent.children) {
        parent.children.push(field);
      }
    } else {
      // Top-level field
      fields.push(field);
    }

    if (isGroup) {
      stack.push({ level: item.level, field });
    }
  }

  return { fields, imports, warnings };
}

function mapDefaultValue(value: string | undefined, javaType: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/"/g, "").replace(/'/g, "");

  if (v === "SPACES" || v === "SPACE") return '""';
  if (v === "ZEROS" || v === "ZEROES" || v === "ZERO") {
    if (javaType === "BigDecimal") return "BigDecimal.ZERO";
    if (javaType === "int" || javaType === "long") return "0";
    return '"0"';
  }
  if (v === "LOW-VALUES" || v === "LOW-VALUE") return "null";
  if (v === "HIGH-VALUES" || v === "HIGH-VALUE") return "null";

  // Numeric literal
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) {
    if (javaType === "BigDecimal") return `new BigDecimal("${v}")`;
    return v;
  }

  // String literal
  if (javaType === "String") return `"${v}"`;

  return undefined;
}
