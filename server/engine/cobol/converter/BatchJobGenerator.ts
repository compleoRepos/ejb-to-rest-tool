/**
 * BatchJobGenerator.ts — Spring Batch Job/Step configuration generator
 * Generates Spring Batch infrastructure from COBOL batch programs and JCL.
 *
 * Mapping:
 *   JCL JOB       → @Configuration class with @Bean Job
 *   JCL STEP      → @Bean Step (with reader/processor/writer)
 *   EXEC PGM=X    → Tasklet or Chunk-oriented step
 *   DD SYSOUT     → FlatFileItemWriter
 *   DD DSN=file   → FlatFileItemReader
 *   SORT          → Spring Batch SortStep (custom comparator)
 *   COND=(rc,op)  → StepExecutionDecider
 *
 * @author Compleo v11.1
 */

import { cobolNameToJava, cobolNameToClassName } from "./DataItemMapper";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JclStep {
  stepName: string;
  program: string;
  ddStatements: { name: string; dsn: string; disp: string; type: string }[];
  condition: string | null;
  region: string | null;
}

export interface JclJob {
  name: string;
  jobClass?: string;
  steps: JclStep[];
  jobName?: string;
}

export interface BatchJobConfig {
  className: string;
  packageName: string;
  jobName: string;
  steps: BatchStepConfig[];
  imports: Set<string>;
}

export interface BatchStepConfig {
  stepName: string;
  type: "chunk" | "tasklet";
  readerBean?: string;
  processorBean?: string;
  writerBean?: string;
  taskletBean?: string;
  chunkSize: number;
  condition?: string | null;
}

// ─── Job Generation ─────────────────────────────────────────────────────────

/**
 * Generate a Spring Batch Job configuration from JCL.
 */
export function generateBatchJobConfig(
  jclJob: JclJob,
  programNames: string[],
  basePackage: string
): BatchJobConfig {
  const className = `${cobolNameToClassName(jclJob.name)}JobConfig`;
  const jobName = cobolNameToJava(jclJob.name) + "Job";
  const imports = new Set<string>();

  // Core imports
  imports.add("org.springframework.batch.core.Job");
  imports.add("org.springframework.batch.core.Step");
  imports.add("org.springframework.batch.core.job.builder.JobBuilder");
  imports.add("org.springframework.batch.core.step.builder.StepBuilder");
  imports.add("org.springframework.batch.core.repository.JobRepository");
  imports.add("org.springframework.context.annotation.Bean");
  imports.add("org.springframework.context.annotation.Configuration");
  imports.add("org.springframework.transaction.PlatformTransactionManager");

  const steps: BatchStepConfig[] = jclJob.steps.map(step => {
    const hasInputFile = step.ddStatements.some(dd => dd.dsn && dd.type !== "SYSOUT");
    const hasOutputFile = step.ddStatements.some(dd => dd.type === "SYSOUT" || dd.name === "SYSPRINT" || dd.name === "SORTOUT");
    const isSort = step.program === "SORT" || step.program === "ICEMAN" || step.program === "DFSORT";

    if (isSort) {
      imports.add("org.springframework.batch.core.step.tasklet.Tasklet");
      return {
        stepName: cobolNameToJava(step.stepName) + "Step",
        type: "tasklet" as const,
        taskletBean: `${cobolNameToJava(step.stepName)}SortTasklet`,
        chunkSize: 0,
        condition: step.condition,
      };
    }

    if (hasInputFile && hasOutputFile) {
      imports.add("org.springframework.batch.item.file.FlatFileItemReader");
      imports.add("org.springframework.batch.item.file.FlatFileItemWriter");
      return {
        stepName: cobolNameToJava(step.stepName) + "Step",
        type: "chunk" as const,
        readerBean: `${cobolNameToJava(step.stepName)}Reader`,
        processorBean: `${cobolNameToJava(step.stepName)}Processor`,
        writerBean: `${cobolNameToJava(step.stepName)}Writer`,
        chunkSize: 100,
        condition: step.condition,
      };
    }

    // Default: tasklet (simple processing)
    imports.add("org.springframework.batch.core.step.tasklet.Tasklet");
    return {
      stepName: cobolNameToJava(step.stepName) + "Step",
      type: "tasklet" as const,
      taskletBean: `${cobolNameToJava(step.stepName)}Tasklet`,
      chunkSize: 0,
      condition: step.condition,
    };
  });

  return { className, packageName: basePackage + ".batch", jobName, steps, imports };
}

/**
 * Render a BatchJobConfig to Java source code.
 */
export function renderBatchJobConfig(config: BatchJobConfig): string {
  const lines: string[] = [];

  // Package
  lines.push(`package ${config.packageName};`);
  lines.push("");

  // Imports
  const sortedImports = [...config.imports].sort();
  for (const imp of sortedImports) {
    lines.push(`import ${imp};`);
  }
  lines.push("");

  // Class
  lines.push(`@Configuration`);
  lines.push(`public class ${config.className} {`);
  lines.push("");

  // Job bean
  lines.push(`    @Bean`);
  lines.push(`    public Job ${config.jobName}(JobRepository jobRepository,`);
  lines.push(`            ${config.steps.map(s => `Step ${s.stepName}`).join(",\n            ")}) {`);
  lines.push(`        return new JobBuilder("${config.jobName}", jobRepository)`);

  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    if (i === 0) {
      lines.push(`                .start(${step.stepName})`);
    } else if (step.condition) {
      lines.push(`                .next(${step.stepName}) // COND: ${step.condition}`);
    } else {
      lines.push(`                .next(${step.stepName})`);
    }
  }

  lines.push(`                .build();`);
  lines.push(`    }`);
  lines.push("");

  // Step beans
  for (const step of config.steps) {
    lines.push(`    @Bean`);
    if (step.type === "chunk") {
      lines.push(`    public Step ${step.stepName}(JobRepository jobRepository,`);
      lines.push(`            PlatformTransactionManager transactionManager,`);
      lines.push(`            ${step.readerBean ? `FlatFileItemReader<?> ${step.readerBean},` : ""}`);
      lines.push(`            ${step.writerBean ? `FlatFileItemWriter<?> ${step.writerBean}` : ""}) {`);
      lines.push(`        return new StepBuilder("${step.stepName}", jobRepository)`);
      lines.push(`                .<Object, Object>chunk(${step.chunkSize}, transactionManager)`);
      if (step.readerBean) lines.push(`                .reader(${step.readerBean})`);
      if (step.processorBean) lines.push(`                // .processor(${step.processorBean})`);
      if (step.writerBean) lines.push(`                .writer(${step.writerBean})`);
      lines.push(`                .build();`);
    } else {
      lines.push(`    public Step ${step.stepName}(JobRepository jobRepository,`);
      lines.push(`            PlatformTransactionManager transactionManager,`);
      lines.push(`            Tasklet ${step.taskletBean}) {`);
      lines.push(`        return new StepBuilder("${step.stepName}", jobRepository)`);
      lines.push(`                .tasklet(${step.taskletBean}, transactionManager)`);
      lines.push(`                .build();`);
    }
    lines.push(`    }`);
    lines.push("");
  }

  lines.push(`}`);

  return lines.join("\n");
}

// ─── File I/O Generation ────────────────────────────────────────────────────

export interface FileIOConfig {
  readerName: string;
  writerName: string;
  recordClassName: string;
  fields: { name: string; start: number; end: number }[];
}

/**
 * Generate FlatFileItemReader bean for a COBOL FD record.
 */
export function generateFlatFileReader(
  fdName: string,
  recordFields: { name: string; length: number }[]
): string {
  const readerName = `${cobolNameToJava(fdName)}Reader`;
  const lines: string[] = [];

  lines.push(`    @Bean`);
  lines.push(`    @StepScope`);
  lines.push(`    public FlatFileItemReader<${cobolNameToClassName(fdName)}Record> ${readerName}(`);
  lines.push(`            @Value("#{jobParameters['inputFile']}") String inputFile) {`);
  lines.push(`        FixedLengthTokenizer tokenizer = new FixedLengthTokenizer();`);

  // Build ranges from field lengths
  let pos = 1;
  const ranges: string[] = [];
  const names: string[] = [];
  for (const field of recordFields) {
    ranges.push(`${pos}-${pos + field.length - 1}`);
    names.push(cobolNameToJava(field.name));
    pos += field.length;
  }

  lines.push(`        tokenizer.setColumns(new Range[]{${ranges.map(r => `new Range(${r.replace("-", ", ")})`).join(", ")}});`);
  lines.push(`        tokenizer.setNames(${names.map(n => `"${n}"`).join(", ")});`);
  lines.push("");
  lines.push(`        return new FlatFileItemReaderBuilder<${cobolNameToClassName(fdName)}Record>()`);
  lines.push(`                .name("${readerName}")`);
  lines.push(`                .resource(new FileSystemResource(inputFile))`);
  lines.push(`                .lineTokenizer(tokenizer)`);
  lines.push(`                .fieldSetMapper(new BeanWrapperFieldSetMapper<>() {{`);
  lines.push(`                    setTargetType(${cobolNameToClassName(fdName)}Record.class);`);
  lines.push(`                }})`);
  lines.push(`                .build();`);
  lines.push(`    }`);

  return lines.join("\n");
}

/**
 * Generate FlatFileItemWriter bean for a COBOL output file.
 */
export function generateFlatFileWriter(fdName: string, recordFields: { name: string; length: number }[]): string {
  const writerName = `${cobolNameToJava(fdName)}Writer`;
  const lines: string[] = [];

  lines.push(`    @Bean`);
  lines.push(`    @StepScope`);
  lines.push(`    public FlatFileItemWriter<${cobolNameToClassName(fdName)}Record> ${writerName}(`);
  lines.push(`            @Value("#{jobParameters['outputFile']}") String outputFile) {`);
  lines.push(`        return new FlatFileItemWriterBuilder<${cobolNameToClassName(fdName)}Record>()`);
  lines.push(`                .name("${writerName}")`);
  lines.push(`                .resource(new FileSystemResource(outputFile))`);
  lines.push(`                .lineAggregator(new FormatterLineAggregator<>() {{`);

  // Build format string from field lengths
  const format = recordFields.map(f => `%-${f.length}s`).join("");
  const fieldGetters = recordFields.map(f => `item.get${cobolNameToClassName(f.name)}()`).join(", ");

  lines.push(`                    setFormat("${format}");`);
  lines.push(`                }})`);
  lines.push(`                .build();`);
  lines.push(`    }`);

  return lines.join("\n");
}
