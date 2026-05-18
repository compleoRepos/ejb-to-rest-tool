# Extraction Map for spring-generator.ts → 8 sub-generators

## Shared types & utils (shared.ts)
- Lines 46-106: interfaces (GeneratedFile, GenerationResult, GenerationStats, etc.)
- Lines 265-370: inferSemanticEndpoint, detectIdParam, getIdParamName, pluralize
- Lines 513-591: mapToSpringType
- Lines 2191-2213: toPascalCase, toMethodName, capitalize, mapDtoClassName

## ControllerGenerator.ts
- Lines 1073-1209: generateDomainController, getHttpAnnotation

## ServiceGenerator.ts
- Lines 785-1072: generateDomainService, generateServiceMethodBody
- Needs: BusinessLogicTransformer, AST pipeline imports

## DtoGenerator.ts
- Lines 372-432: inferBeanValidation
- Lines 460-512: generateDto

## TestGenerator.ts
- Lines 1211-1414: generateDomainControllerTest, buildRealisticRequestJson, getRealisticValue, buildRealisticResponseMock, buildJsonPathAssertions

## ExceptionGenerator.ts
- Lines 613-784: generateException, generateGlobalExceptionHandler, generateValidator
- Lines 156-177: BusinessRuleException generation

## ConfigGenerator.ts
- Lines 433-459: generateMainApplication
- Lines 1541-1604: generateApplicationYml, generateApplicationProperties

## CloudGenerator.ts
- Lines 1605-1761: generateDockerfile, generateDockerCompose, generateK8sDeployment, generateK8sService

## PomGenerator.ts
- Lines 1762-1859: generatePomXml

## index.ts (orchestrator)
- Lines 110-261: generateSpringBootProject (refactored to call sub-generators)
- Lines 2098-2189: verifySyntax, verifyJavaFile

## MigrationReportGenerator (already separate but inline)
- Lines 1860-2097: generateMigrationReport
