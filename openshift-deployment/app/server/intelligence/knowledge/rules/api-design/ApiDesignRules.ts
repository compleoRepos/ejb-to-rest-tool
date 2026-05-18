/**
 * apiDesignRules — Auto-generated rules for api-design
 * Total: 50 rules
 */
import { Rule, RuleHit } from "../RuleEngine";

export const apiDesignRules: Rule[] = [
  {
    id: "API_REST_001",
    category: "API_DESIGN",
    name: "Verb dans URL",
    severity: "major",
    description: "Verbe HTTP dans le chemin URL au lieu de methode HTTP",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)\s*\(\s*["'].*(?:get|create|update|delete|remove|add|fetch)\w*/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_002",
    category: "API_DESIGN",
    name: "Plural inconsistant",
    severity: "minor",
    description: "Ressource REST non au pluriel",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|GetMapping|PostMapping)\s*\(\s*["']\/(?:user|account|product|order|payment|client|document)["']/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_003",
    category: "API_DESIGN",
    name: "Nested resource profond",
    severity: "minor",
    description: "URL REST avec plus de 3 niveaux de nesting",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)\s*\(\s*["'](?:\/\w+){4,}/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_004",
    category: "API_DESIGN",
    name: "Response sans status code",
    severity: "major",
    description: "Endpoint REST sans code de statut explicite",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:GetMapping|PostMapping|PutMapping|DeleteMapping)(?![\s\S]{0,300}(?:ResponseStatus|ResponseEntity|status\())/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_005",
    category: "API_DESIGN",
    name: "POST sans 201",
    severity: "minor",
    description: "Endpoint POST de creation sans retour 201 Created",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@PostMapping(?![\s\S]{0,300}(?:CREATED|201|HttpStatus\.CREATED))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_006",
    category: "API_DESIGN",
    name: "DELETE sans 204",
    severity: "minor",
    description: "Endpoint DELETE sans retour 204 No Content",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@DeleteMapping(?![\s\S]{0,300}(?:NO_CONTENT|204|HttpStatus\.NO_CONTENT))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_007",
    category: "API_DESIGN",
    name: "PATCH absent",
    severity: "minor",
    description: "Pas de PATCH pour mise a jour partielle",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:@PatchMapping|PATCH))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_008",
    category: "API_DESIGN",
    name: "Content negotiation absent",
    severity: "minor",
    description: "Pas de content negotiation (Accept header)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:GetMapping|PostMapping)(?![\s\S]{0,200}(?:produces|consumes|MediaType))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_009",
    category: "API_DESIGN",
    name: "HATEOAS absent",
    severity: "minor",
    description: "API REST sans liens HATEOAS",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:GetMapping|PostMapping)(?![\s\S]{0,500}(?:Link|EntityModel|CollectionModel|_links))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_010",
    category: "API_DESIGN",
    name: "Pagination absente",
    severity: "major",
    description: "Endpoint liste sans pagination",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@GetMapping[\s\S]{0,200}(?:List|Collection)(?![\s\S]{0,300}(?:Pageable|page|limit|offset))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_011",
    category: "API_DESIGN",
    name: "Filtrage absent",
    severity: "minor",
    description: "Endpoint liste sans parametres de filtrage",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@GetMapping[\s\S]{0,200}(?:findAll|list|getAll)(?![\s\S]{0,200}(?:@RequestParam|filter|search|query))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_012",
    category: "API_DESIGN",
    name: "Tri absent",
    severity: "minor",
    description: "Endpoint liste sans parametres de tri",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@GetMapping[\s\S]{0,200}(?:findAll|list)(?![\s\S]{0,200}(?:sort|order|Sort))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_013",
    category: "API_DESIGN",
    name: "Error format inconsistant",
    severity: "major",
    description: "Format d erreur non standardise",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@ExceptionHandler(?![\s\S]{0,300}(?:ErrorResponse|ProblemDetail|ApiError))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_014",
    category: "API_DESIGN",
    name: "Validation absente",
    severity: "critical",
    description: "Input non valide sur endpoint POST/PUT",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:PostMapping|PutMapping)[\s\S]{0,200}\(\s*(?:@RequestBody\s+)?(?!@Valid)\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_015",
    category: "API_DESIGN",
    name: "Rate limiting absent",
    severity: "major",
    description: "API publique sans rate limiting",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:GetMapping|PostMapping|RestController)(?![\s\S]{0,500}(?:RateLimit|Throttle|Bucket))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_016",
    category: "API_DESIGN",
    name: "Idempotency key absent",
    severity: "major",
    description: "POST/PUT sans idempotency key",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:PostMapping|PutMapping)(?![\s\S]{0,300}(?:idempotency|Idempotent|dedup))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_017",
    category: "API_DESIGN",
    name: "ETag absent",
    severity: "minor",
    description: "GET sans support ETag/If-None-Match",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@GetMapping(?![\s\S]{0,300}(?:ETag|If-None-Match|lastModified))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_018",
    category: "API_DESIGN",
    name: "Compression absente",
    severity: "minor",
    description: "Reponse sans compression gzip",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RestController(?![\s\S]{0,2000}(?:gzip|compress|Content-Encoding))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_019",
    category: "API_DESIGN",
    name: "Timeout client absent",
    severity: "major",
    description: "Client HTTP sans timeout configure",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient|HttpClient)(?![\s\S]{0,300}(?:timeout|connectTimeout|readTimeout))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_020",
    category: "API_DESIGN",
    name: "Retry client absent",
    severity: "major",
    description: "Client HTTP sans strategie de retry",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)(?![\s\S]{0,300}(?:retry|Retry|backoff))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_021",
    category: "API_DESIGN",
    name: "Circuit breaker client",
    severity: "major",
    description: "Client HTTP sans circuit breaker",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:RestTemplate|WebClient)\.(?:get|post|put|delete)(?![\s\S]{0,300}(?:circuitBreaker|fallback))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_022",
    category: "API_DESIGN",
    name: "Bulk endpoint absent",
    severity: "minor",
    description: "Pas d endpoint bulk pour operations en masse",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:bulk|batch|Bulk|Batch))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_023",
    category: "API_DESIGN",
    name: "Async endpoint absent",
    severity: "minor",
    description: "Pas d endpoint async pour operations longues",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:async|Async|CompletableFuture|DeferredResult))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_024",
    category: "API_DESIGN",
    name: "Webhook absent",
    severity: "minor",
    description: "Pas de webhook pour notifications",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+Controller(?![\s\S]{0,2000}(?:webhook|Webhook|callback|Callback))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_REST_025",
    category: "API_DESIGN",
    name: "OpenAPI spec absent",
    severity: "minor",
    description: "Pas de specification OpenAPI/Swagger",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RestController(?![\s\S]{0,2000}(?:@Api|@Operation|@Schema|@Tag))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_001",
    category: "API_DESIGN",
    name: "Entity en response",
    severity: "critical",
    description: "Entite JPA exposee directement en reponse API",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity[\s\S]{0,200}@(?:JsonProperty|JsonIgnore)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_002",
    category: "API_DESIGN",
    name: "DTO sans validation",
    severity: "major",
    description: "DTO sans annotations de validation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:DTO|Request|Dto)\b(?![\s\S]{0,500}(?:@NotNull|@NotBlank|@Size|@Valid|@Min|@Max))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_003",
    category: "API_DESIGN",
    name: "Circular reference JSON",
    severity: "critical",
    description: "Reference circulaire dans serialisation JSON",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:OneToMany|ManyToOne)(?![\s\S]{0,200}(?:@JsonIgnore|@JsonBackReference|@JsonManagedReference))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_004",
    category: "API_DESIGN",
    name: "Date format inconsistant",
    severity: "minor",
    description: "Format de date non standardise dans API",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:Date|LocalDate|LocalDateTime)\s+\w+(?![\s\S]{0,100}(?:@JsonFormat|@DateTimeFormat))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_005",
    category: "API_DESIGN",
    name: "Null dans collection",
    severity: "minor",
    description: "Collection nullable au lieu de collection vide",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:List|Set|Map)\s*<.*>\s+\w+\s*(?:;|=\s*null)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_006",
    category: "API_DESIGN",
    name: "Enum sans @JsonValue",
    severity: "minor",
    description: "Enum expose sans controle de serialisation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /enum\s+\w+(?![\s\S]{0,300}(?:@JsonValue|@JsonCreator))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_007",
    category: "API_DESIGN",
    name: "BigDecimal sans format",
    severity: "major",
    description: "BigDecimal sans format de serialisation",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /BigDecimal\s+\w+(?![\s\S]{0,100}(?:@JsonFormat|@JsonSerialize))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_008",
    category: "API_DESIGN",
    name: "Response wrapper absent",
    severity: "minor",
    description: "Reponse sans wrapper standardise",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /return\s+(?:new\s+)?(?:List|Map|Set|Collection)(?![\s\S]{0,100}(?:ResponseEntity|ApiResponse|Result))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_009",
    category: "API_DESIGN",
    name: "Sensitive field expose",
    severity: "critical",
    description: "Champ sensible expose dans API response",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:password|secret|token|apiKey)\s*(?:;|=)(?![\s\S]{0,100}(?:@JsonIgnore|@JsonProperty.*access.*WRITE))/gi;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_010",
    category: "API_DESIGN",
    name: "Immutable DTO absent",
    severity: "minor",
    description: "DTO mutable au lieu de record/immutable",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /class\s+\w+(?:DTO|Response|Dto)\b[\s\S]{0,500}(?:set\w+\s*\()/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_011",
    category: "API_DESIGN",
    name: "Mapper manual",
    severity: "minor",
    description: "Mapping DTO manuel au lieu de MapStruct/ModelMapper",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /new\s+\w+(?:DTO|Dto)\s*\(\)[\s\S]{0,200}\.set\w+\(/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_012",
    category: "API_DESIGN",
    name: "Version field absent",
    severity: "minor",
    description: "DTO sans champ de version pour concurrence optimiste",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity[\s\S]{0,500}(?!@Version)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_013",
    category: "API_DESIGN",
    name: "Audit fields absent",
    severity: "minor",
    description: "Entite sans champs d audit (createdAt, updatedAt)",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity(?![\s\S]{0,500}(?:createdAt|updatedAt|@CreatedDate|@LastModifiedDate))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_014",
    category: "API_DESIGN",
    name: "Soft delete absent",
    severity: "minor",
    description: "Entite sans soft delete",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Entity(?![\s\S]{0,500}(?:deleted|isDeleted|deletedAt|@SoftDelete))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_DTO_015",
    category: "API_DESIGN",
    name: "Projection absent",
    severity: "minor",
    description: "Pas de projection pour requetes optimisees",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /(?:findAll|findBy)\w*\((?![\s\S]{0,200}(?:Projection|@Query.*SELECT\s+new))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_001",
    category: "API_DESIGN",
    name: "API non versionee",
    severity: "major",
    description: "API sans versioning dans le chemin",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)\s*\(\s*["']\/(?!v\d)\w+/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_002",
    category: "API_DESIGN",
    name: "Breaking change",
    severity: "critical",
    description: "Changement cassant sans nouvelle version",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Deprecated|deprecated)[\s\S]{0,200}@(?:Path|RequestMapping)/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_003",
    category: "API_DESIGN",
    name: "Deprecation sans sunset",
    severity: "minor",
    description: "API deprecated sans date de fin de vie",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@Deprecated(?![\s\S]{0,200}(?:sunset|Sunset|endOfLife|removal))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_004",
    category: "API_DESIGN",
    name: "Migration guide absent",
    severity: "minor",
    description: "Nouvelle version API sans guide de migration",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /v\d+[\s\S]{0,100}v\d+(?![\s\S]{0,500}(?:migration|Migration|upgrade|Upgrade))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_005",
    category: "API_DESIGN",
    name: "Backward compat absent",
    severity: "major",
    description: "Pas de compatibilite ascendante entre versions",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@(?:Path|RequestMapping)\s*\(\s*["']\/v\d+(?![\s\S]{0,500}(?:v\d+|backward|compatible))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_006",
    category: "API_DESIGN",
    name: "Header versioning",
    severity: "minor",
    description: "Versioning par header au lieu de URL path",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /Accept.*version|X-API-Version/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_007",
    category: "API_DESIGN",
    name: "Query param versioning",
    severity: "minor",
    description: "Versioning par query param au lieu de URL path",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /\?.*version=\d+|@RequestParam.*version/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_008",
    category: "API_DESIGN",
    name: "Changelog API absent",
    severity: "minor",
    description: "Pas de changelog pour l API",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RestController(?![\s\S]{0,2000}(?:changelog|CHANGELOG|version.*history))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_009",
    category: "API_DESIGN",
    name: "SDK generation absent",
    severity: "minor",
    description: "Pas de generation SDK client",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RestController(?![\s\S]{0,2000}(?:openapi|swagger|codegen))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
  {
    id: "API_VER_010",
    category: "API_DESIGN",
    name: "Contract test absent",
    severity: "minor",
    description: "Pas de test de contrat API",
    evaluate(ctx): RuleHit[] {
      const hits: RuleHit[] = [];
      const regex = /@RestController(?![\s\S]{0,2000}(?:contract|Contract|pact|Pact))/g;
let m;
while ((m = regex.exec(ctx.rawSource)) !== null) {
        hits.push({ ruleId: this.id, severity: this.severity, location: `line ~${ctx.rawSource.substring(0, m.index).split("\n").length}`, message: this.description, suggestion: "" });
      }
      return hits;
    },
  },
];
