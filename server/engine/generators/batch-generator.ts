import type { CodeGenerator, DetectedComponent, BatchComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class BatchGenerator implements CodeGenerator {
  readonly technology = "BATCH" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "BATCH"; }

  generate(component: DetectedComponent, allComponents: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as BatchComponent;
    const files: GeneratedFile[] = [];
    const pp = basePackage.replace(/\./g, "/");
    const baseName = c.className.replace(/Reader$|Processor$|Writer$|Batchlet$/, "");

    if (c.metadata.role === "READER") {
      files.push({ path: `src/main/java/${pp}/batch/${baseName}ItemReader.java`, content: this.genReader(c, baseName, basePackage), category: "infrastructure", technology: "BATCH", sourceRef: c.filePath });
    } else if (c.metadata.role === "PROCESSOR") {
      files.push({ path: `src/main/java/${pp}/batch/${baseName}ItemProcessor.java`, content: this.genProcessor(c, baseName, basePackage), category: "infrastructure", technology: "BATCH", sourceRef: c.filePath });
    } else if (c.metadata.role === "WRITER") {
      files.push({ path: `src/main/java/${pp}/batch/${baseName}ItemWriter.java`, content: this.genWriter(c, baseName, basePackage), category: "infrastructure", technology: "BATCH", sourceRef: c.filePath });
    }

    // Generate job config if we have all 3 components for this base name
    const hasReader = allComponents.some(x => x.technology === "BATCH" && (x as BatchComponent).metadata.role === "READER" && x.className.startsWith(baseName));
    const hasProcessor = allComponents.some(x => x.technology === "BATCH" && (x as BatchComponent).metadata.role === "PROCESSOR" && x.className.startsWith(baseName));
    const hasWriter = allComponents.some(x => x.technology === "BATCH" && (x as BatchComponent).metadata.role === "WRITER" && x.className.startsWith(baseName));

    if (c.metadata.role === "READER" && hasProcessor && hasWriter) {
      files.push({ path: `src/main/java/${pp}/batch/${baseName}BatchConfig.java`, content: this.genConfig(c, baseName, basePackage), category: "config", technology: "BATCH", sourceRef: c.filePath });
    }

    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genReader(c: BatchComponent, baseName: string, pkg: string): string {
    const itemType = c.metadata.itemType || "Object";
    return `package ${pkg}.batch;\n\nimport org.springframework.batch.item.ItemReader;\nimport org.springframework.stereotype.Component;\nimport lombok.extern.slf4j.Slf4j;\n\n/** Spring Batch ItemReader migre depuis: ${c.className} */\n@Component\n@Slf4j\npublic class ${baseName}ItemReader implements ItemReader<${itemType}> {\n\n    @Override\n    public ${itemType} read() throws Exception {\n        // TODO: Migrer la logique de lecture depuis ${c.className}\n        return null; // null = fin du batch\n    }\n}\n`;
  }

  private genProcessor(c: BatchComponent, baseName: string, pkg: string): string {
    const inType = c.metadata.itemType || "Object";
    const outType = c.metadata.outputType || "Object";
    return `package ${pkg}.batch;\n\nimport org.springframework.batch.item.ItemProcessor;\nimport org.springframework.stereotype.Component;\nimport lombok.extern.slf4j.Slf4j;\n\n/** Spring Batch ItemProcessor migre depuis: ${c.className} */\n@Component\n@Slf4j\npublic class ${baseName}ItemProcessor implements ItemProcessor<${inType}, ${outType}> {\n\n    @Override\n    public ${outType} process(${inType} item) throws Exception {\n        // TODO: Migrer la logique de traitement depuis ${c.className}\n        return null;\n    }\n}\n`;
  }

  private genWriter(c: BatchComponent, baseName: string, pkg: string): string {
    const outType = c.metadata.outputType || c.metadata.itemType || "Object";
    return `package ${pkg}.batch;\n\nimport org.springframework.batch.item.Chunk;\nimport org.springframework.batch.item.ItemWriter;\nimport org.springframework.stereotype.Component;\nimport lombok.extern.slf4j.Slf4j;\n\n/** Spring Batch ItemWriter migre depuis: ${c.className} */\n@Component\n@Slf4j\npublic class ${baseName}ItemWriter implements ItemWriter<${outType}> {\n\n    @Override\n    public void write(Chunk<? extends ${outType}> items) throws Exception {\n        // TODO: Migrer la logique d'ecriture depuis ${c.className}\n        log.info("Ecriture de {} items", items.size());\n    }\n}\n`;
  }

  private genConfig(c: BatchComponent, baseName: string, pkg: string): string {
    const inType = c.metadata.itemType || "Object";
    const outType = c.metadata.outputType || "Object";
    return `package ${pkg}.batch;\n\nimport org.springframework.batch.core.Job;\nimport org.springframework.batch.core.Step;\nimport org.springframework.batch.core.job.builder.JobBuilder;\nimport org.springframework.batch.core.step.builder.StepBuilder;\nimport org.springframework.batch.core.repository.JobRepository;\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.transaction.PlatformTransactionManager;\nimport lombok.RequiredArgsConstructor;\n\n/** Configuration Spring Batch migree depuis le job: ${baseName} */\n@Configuration\n@RequiredArgsConstructor\npublic class ${baseName}BatchConfig {\n\n    private final ${baseName}ItemReader reader;\n    private final ${baseName}ItemProcessor processor;\n    private final ${baseName}ItemWriter writer;\n\n    @Bean\n    public Job ${baseName.charAt(0).toLowerCase() + baseName.slice(1)}Job(JobRepository jobRepository, Step ${baseName.charAt(0).toLowerCase() + baseName.slice(1)}Step) {\n        return new JobBuilder("${baseName.toLowerCase()}-job", jobRepository)\n            .start(${baseName.charAt(0).toLowerCase() + baseName.slice(1)}Step)\n            .build();\n    }\n\n    @Bean\n    public Step ${baseName.charAt(0).toLowerCase() + baseName.slice(1)}Step(JobRepository jobRepository, PlatformTransactionManager transactionManager) {\n        return new StepBuilder("${baseName.toLowerCase()}-step", jobRepository)\n            .<${inType}, ${outType}>chunk(100, transactionManager)\n            .reader(reader)\n            .processor(processor)\n            .writer(writer)\n            .build();\n    }\n}\n`;
  }
}
