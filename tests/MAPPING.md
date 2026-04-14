# Mapping Spec → Real Functions

## Parser
- Spec: `parseUseCases(src)` → Real: `parseEjbProject([{path, content}])` returns `ProjectIR` with `.useCases[]`
- Spec: `detectDataSources(src)` → Real: `new DataSourceDetector().detect(files)` returns `DataSourceInfo`
- Spec: `inferDomain(className)` → Real: `extractDomain(packageName, className)` (not exported, internal to java-parser.ts)

## Generator
- Spec: `generateServiceMethod(uc)` → Real: `generateDomainService(basePackage, basePath, domain, useCases, dtoMap, ir)` returns `GeneratedFile`
- Spec: `generateService(name, [uc])` → Real: same as above
- Spec: `generatePom(ctx)` → Real: `generatePomXml(ir, basePackage)` returns `GeneratedFile`
- Spec: `routeToMethodName(route)` → Real: `routeToHandlerName(route)` in servlet-detector.ts (not exported)
- Spec: `resolveUrlConflicts(endpoints)` → Real: conflict resolution in controller-gen.ts (inline, not exported)
- Spec: `inferHttpVerb(name)` → Real: `determineHttpConfig(uc, domain)` in shared.ts

## Engine
- Spec: `compleo.generate(zipPath)` → Real: `getEngine().generate(ir, choices)` returns `GeneratedProject`
- Real full pipeline: `parseEjbProject(files) → generateSpringBootProject(ir) → GenerationResult`

## Key Differences
1. Functions are NOT standalone — they take IR objects, not raw source strings
2. `extractDomain` and `isDirectEjb`/`isUseCase`/`isDao` are NOT exported
3. Tests must use `parseEjbProject` to get IR, then call generators
4. No `routeToMethodName` export — it's inside `ServletDetector` class
5. No `resolveUrlConflicts` export — it's inline in controller-gen.ts
