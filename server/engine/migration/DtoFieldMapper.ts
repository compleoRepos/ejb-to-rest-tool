/**
 * DtoFieldMapper — v12.3
 * 
 * Génère automatiquement les DTOs et les mappers à partir des entités détectées.
 * 
 * Stratégie :
 * 1. Rule-based : si les champs ont le même nom → copier 1:1
 * 2. Type mapping : Date→LocalDate, java.sql.Timestamp→LocalDateTime, etc.
 * 3. LLM fallback : si renaming nécessaire (champs ambigus)
 * 
 * Quand garder le TODO : si l'entité source a des champs qui n'existent pas
 * dans le modèle cible (renaming nécessaire) → garder le TODO avec les champs listés.
 * 
 * @author Hamza NORDINE — Compleo
 */

export interface EntityField {
  name: string;
  type: string;
  annotations?: string[];
}

export interface DtoMappingResult {
  canMap: boolean;
  reason?: string;
  dtoCode: string;
  mapperCode: string;
  unmappedFields: string[];
}

// Type conversions rule-based
const TYPE_MAPPINGS: Record<string, string> = {
  'java.util.Date': 'LocalDate',
  'Date': 'LocalDate',
  'java.sql.Date': 'LocalDate',
  'java.sql.Timestamp': 'LocalDateTime',
  'Timestamp': 'LocalDateTime',
  'java.sql.Time': 'LocalTime',
  'Calendar': 'LocalDateTime',
  'java.util.Calendar': 'LocalDateTime',
  'BigDecimal': 'BigDecimal',
  'BigInteger': 'BigInteger',
  'byte[]': 'byte[]',
  'Byte[]': 'byte[]',
  'char': 'String',
  'Character': 'String',
};

// Fields to exclude from DTOs (JPA internal)
const EXCLUDED_FIELDS = new Set([
  'serialVersionUID',
  'version',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'hibernateLazyInitializer',
  'handler',
]);

/**
 * Génère un DTO et un mapper à partir d'une entité.
 */
export function generateDtoAndMapper(
  entityName: string,
  entityFields: EntityField[],
  packageName: string,
): DtoMappingResult {
  // Filter out excluded fields
  const mappableFields = entityFields.filter(f => !EXCLUDED_FIELDS.has(f.name));
  
  if (mappableFields.length === 0) {
    return {
      canMap: false,
      reason: `Entity ${entityName} has no mappable fields`,
      dtoCode: '',
      mapperCode: '',
      unmappedFields: [],
    };
  }

  // Check for ambiguous fields that need renaming
  const unmappedFields: string[] = [];
  const dtoFields: { name: string; type: string; originalType: string }[] = [];

  for (const field of mappableFields) {
    const dtoType = mapType(field.type);
    dtoFields.push({ name: field.name, type: dtoType, originalType: field.type });
    
    // If type changed significantly (not just wrapper), note it
    if (dtoType !== field.type && !isSimpleTypeMapping(field.type, dtoType)) {
      unmappedFields.push(`${field.name}: ${field.type} → ${dtoType}`);
    }
  }

  // If too many unmapped fields (>50%), keep TODO
  if (unmappedFields.length > mappableFields.length * 0.5) {
    return {
      canMap: false,
      reason: `Too many type changes (${unmappedFields.length}/${mappableFields.length}) — manual review needed`,
      dtoCode: '',
      mapperCode: '',
      unmappedFields,
    };
  }

  const dtoName = `${entityName}DTO`;
  const dtoCode = generateDtoClass(dtoName, dtoFields, packageName);
  const mapperCode = generateMapperClass(entityName, dtoName, dtoFields, packageName);

  return {
    canMap: true,
    dtoCode,
    mapperCode,
    unmappedFields,
  };
}

/**
 * Extrait les champs d'une entité depuis le code source Java.
 */
export function extractEntityFields(sourceCode: string): EntityField[] {
  const fields: EntityField[] = [];
  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip annotations, comments, methods, class declarations
    if (line.startsWith('@') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    if (line.includes('(') && line.includes(')')) continue; // method
    if (line.startsWith('public class') || line.startsWith('private class')) continue;
    if (line.startsWith('import ') || line.startsWith('package ')) continue;
    if (line === '{' || line === '}' || line === '') continue;

    // Match field declaration: private Type name; or private Type name = value;
    const fieldMatch = line.match(/(?:private|protected)\s+([\w<>,\s\[\]?]+?)\s+(\w+)\s*[;=]/);
    if (fieldMatch) {
      const type = fieldMatch[1].trim();
      const name = fieldMatch[2].trim();
      
      // Collect annotations from preceding lines
      const annotations: string[] = [];
      for (let j = i - 1; j >= 0; j--) {
        const prevLine = lines[j].trim();
        if (prevLine.startsWith('@')) {
          annotations.push(prevLine);
        } else if (prevLine === '' || prevLine.startsWith('//')) {
          continue;
        } else {
          break;
        }
      }
      
      fields.push({ name, type, annotations });
    }
  }

  return fields;
}

/**
 * Génère le code du DTO à partir des champs de l'entité.
 * Remplace le TODO "Mapper les champs" dans le fichier généré.
 */
export function generateInlineDtoMapping(
  entityName: string,
  entityFields: EntityField[],
  variableName: string,
): string {
  const mappableFields = entityFields.filter(f => !EXCLUDED_FIELDS.has(f.name));
  
  if (mappableFields.length === 0) {
    return `// No mappable fields found for ${entityName}`;
  }

  const lines: string[] = [];
  const dtoName = `${entityName}DTO`;
  const dtoVar = `${variableName}Dto`;
  
  lines.push(`        ${dtoName} ${dtoVar} = new ${dtoName}();`);
  
  for (const field of mappableFields) {
    const getter = `get${capitalize(field.name)}()`;
    const setter = `set${capitalize(field.name)}`;
    const sourceType = field.type;
    const targetType = mapType(sourceType);
    
    if (sourceType === targetType || isSimpleTypeMapping(sourceType, targetType)) {
      // Direct mapping
      lines.push(`        ${dtoVar}.${setter}(${variableName}.${getter});`);
    } else if (sourceType === 'Date' || sourceType === 'java.util.Date') {
      // Date → LocalDate conversion
      lines.push(`        ${dtoVar}.${setter}(${variableName}.${getter} != null ? ${variableName}.${getter}.toInstant().atZone(ZoneId.systemDefault()).toLocalDate() : null);`);
    } else if (sourceType === 'Timestamp' || sourceType === 'java.sql.Timestamp') {
      // Timestamp → LocalDateTime
      lines.push(`        ${dtoVar}.${setter}(${variableName}.${getter} != null ? ${variableName}.${getter}.toLocalDateTime() : null);`);
    } else {
      // Default: direct copy
      lines.push(`        ${dtoVar}.${setter}(${variableName}.${getter});`);
    }
  }
  
  lines.push(`        return ${dtoVar};`);
  
  return lines.join('\n');
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function mapType(javaType: string): string {
  // Check direct mapping
  if (TYPE_MAPPINGS[javaType]) return TYPE_MAPPINGS[javaType];
  
  // Handle generics: List<X> → List<X>
  const genericMatch = javaType.match(/^(List|Set|Collection)<(.+)>$/);
  if (genericMatch) {
    const innerType = mapType(genericMatch[2]);
    return `${genericMatch[1]}<${innerType}>`;
  }
  
  // Primitives stay the same
  return javaType;
}

function isSimpleTypeMapping(from: string, to: string): boolean {
  // int → Integer, long → Long, etc. are simple
  const wrapperMap: Record<string, string> = {
    'int': 'Integer', 'long': 'Long', 'double': 'Double',
    'float': 'Float', 'boolean': 'Boolean', 'short': 'Short',
    'byte': 'Byte', 'char': 'Character',
  };
  return wrapperMap[from] === to || from === to;
}

function generateDtoClass(
  dtoName: string,
  fields: { name: string; type: string }[],
  packageName: string,
): string {
  const lines: string[] = [];
  lines.push(`package ${packageName}.dto;`);
  lines.push('');
  lines.push('import lombok.Data;');
  lines.push('import lombok.NoArgsConstructor;');
  lines.push('import lombok.AllArgsConstructor;');
  
  // Add imports for special types
  const needsLocalDate = fields.some(f => f.type === 'LocalDate');
  const needsLocalDateTime = fields.some(f => f.type === 'LocalDateTime');
  const needsBigDecimal = fields.some(f => f.type === 'BigDecimal');
  
  if (needsLocalDate) lines.push('import java.time.LocalDate;');
  if (needsLocalDateTime) lines.push('import java.time.LocalDateTime;');
  if (needsBigDecimal) lines.push('import java.math.BigDecimal;');
  
  lines.push('');
  lines.push('@Data');
  lines.push('@NoArgsConstructor');
  lines.push('@AllArgsConstructor');
  lines.push(`public class ${dtoName} {`);
  
  for (const field of fields) {
    lines.push(`    private ${field.type} ${field.name};`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

function generateMapperClass(
  entityName: string,
  dtoName: string,
  fields: { name: string; type: string; originalType: string }[],
  packageName: string,
): string {
  const lines: string[] = [];
  lines.push(`package ${packageName}.mapper;`);
  lines.push('');
  lines.push(`import ${packageName}.entity.${entityName};`);
  lines.push(`import ${packageName}.dto.${dtoName};`);
  lines.push('import org.springframework.stereotype.Component;');
  
  const needsZoneId = fields.some(f => f.originalType === 'Date' || f.originalType === 'java.util.Date');
  if (needsZoneId) lines.push('import java.time.ZoneId;');
  
  lines.push('');
  lines.push('@Component');
  lines.push(`public class ${entityName}Mapper {`);
  lines.push('');
  
  // toDTO method
  lines.push(`    public ${dtoName} toDTO(${entityName} entity) {`);
  lines.push(`        if (entity == null) return null;`);
  lines.push(`        ${dtoName} dto = new ${dtoName}();`);
  
  for (const field of fields) {
    const getter = `get${capitalize(field.name)}()`;
    const setter = `set${capitalize(field.name)}`;
    
    if (field.originalType === field.type) {
      lines.push(`        dto.${setter}(entity.${getter});`);
    } else if (field.originalType === 'Date' || field.originalType === 'java.util.Date') {
      lines.push(`        dto.${setter}(entity.${getter} != null ? entity.${getter}.toInstant().atZone(ZoneId.systemDefault()).toLocalDate() : null);`);
    } else if (field.originalType === 'Timestamp' || field.originalType === 'java.sql.Timestamp') {
      lines.push(`        dto.${setter}(entity.${getter} != null ? entity.${getter}.toLocalDateTime() : null);`);
    } else {
      lines.push(`        dto.${setter}(entity.${getter});`);
    }
  }
  
  lines.push(`        return dto;`);
  lines.push(`    }`);
  lines.push('');
  
  // toEntity method
  lines.push(`    public ${entityName} toEntity(${dtoName} dto) {`);
  lines.push(`        if (dto == null) return null;`);
  lines.push(`        ${entityName} entity = new ${entityName}();`);
  
  for (const field of fields) {
    const getter = `get${capitalize(field.name)}()`;
    const setter = `set${capitalize(field.name)}`;
    lines.push(`        entity.${setter}(dto.${getter});`);
  }
  
  lines.push(`        return entity;`);
  lines.push(`    }`);
  lines.push('}');
  
  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
