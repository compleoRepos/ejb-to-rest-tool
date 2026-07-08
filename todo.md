# Project TODO — EJB to REST Tool v2

## Upgrade full-stack
- [x] Resolve merge conflicts (Home.tsx — keep existing design)
- [x] Run pnpm install and pnpm db:push
- [x] Restart dev server and verify

## Backend API — Upload & Parsing
- [x] API endpoint POST /api/upload/ejb — accept ZIP/JAR/WAR uploads
- [x] API endpoint POST /api/upload/json — accept JSON descriptor files
- [x] Parse uploaded EJB projects (extract interfaces, beans, methods, Envelope fields)
- [ ] Store parsed project metadata in database (projects table, endpoints table)

## Module 1 — Adapter Generator (WAR WebSphere)
- [x] API endpoint to trigger Adapter generation from parsed EJB project
- [x] Generate WAR module: Resource + Converter + DTOs + CodeMapper + POM
- [x] Java 8 / javax.* / WebSphere compatible output
- [x] ZIP packaging and download endpoint
- [x] Documentation generation (README, DEVELOPER-GUIDE, DEPLOYMENT, ARCHITECTURE)

## Module 2 — Wrapper BIAN Generator (Spring Boot)
- [x] API endpoint to trigger BIAN wrapper generation from JSON descriptors
- [x] Map endpoints to BIAN Service Domains (Card Administration, Payment Order, etc.)
- [x] Generate Spring Boot project: Controller BIAN + Service + ACL Mapper
- [x] Generate Resilience4j configuration (Circuit Breaker, Retry, Bulkhead)
- [x] Generate RestAdapter (HTTP client to call Adapter REST endpoints)
- [x] Generate DTOs BIAN (ApiRequest<T> / ApiResponse<T>)
- [x] Generate OpenAPI/Swagger spec
- [x] Generate Dockerfile
- [x] Generate application.yml with Adapter URLs
- [ ] Generate Mermaid sequence diagrams
- [ ] Generate Postman collection
- [x] ZIP packaging and download endpoint
- [x] Documentation generation (README, DEVELOPER-GUIDE, DEPLOYMENT, ARCHITECTURE)

## Frontend — Two-tab IHM
- [ ] Onglet "Adapters" : upload d'un seul projet EJB → génère UN module WAR
- [ ] Onglet "Wrappers BIAN" : upload de PLUSIEURS projets EJB/contrats REST → regroupe par Service Domain → génère Spring Boot
- [ ] Replace mock setTimeout logic with real API calls
- [ ] Real-time progress updates during generation
- [ ] Working ZIP download buttons
- [ ] Results page shows real generated data from DB

## Database schema
- [ ] projects table (id, name, type, status, createdAt)
- [ ] endpoints table (id, projectId, operation, method, path, requestFields, responseFields)
- [ ] generations table (id, projectId, mode adapter|bian, status, zipPath, createdAt)

## Testing — All 26 projects
- [x] Test Adapter generation on all 26 batch2-flat projects (23/26 success, 3 non-EJB)
- [x] Test BIAN wrapper generation (8 wrappers generated, 135 endpoints, 0 errors)
- [x] Audit generated code quality (Controller, Service, Adapter, DTOs, Dockerfile)
- [ ] Handle non-EJB projects gracefully (Servlet/Spring projects)
- [x] Verify all 8 BIAN wrappers compile with Maven (mvn compile = 0 errors)
- [x] Fix Lombok @AllArgsConstructor duplicate constructor issue
- [x] Fix duplicate method names from same-named EJB operations (V2 suffix)
