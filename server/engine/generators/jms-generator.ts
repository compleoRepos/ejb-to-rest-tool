import type { CodeGenerator, DetectedComponent, JmsComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class JmsGenerator implements CodeGenerator {
  readonly technology = "JMS" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "JMS"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as JmsComponent;
    const files: GeneratedFile[] = [];
    const pp = basePackage.replace(/\./g, "/");

    if (c.metadata.role === "MDB" || c.metadata.role === "CONSUMER") {
      const listenerName = c.className.replace(/MDB$|Bean$/, "") + "KafkaListener";
      files.push({ path: `src/main/java/${pp}/messaging/${listenerName}.java`, content: this.genListener(c, listenerName, basePackage), category: "infrastructure", technology: "JMS", sourceRef: c.filePath });
    }

    if (c.metadata.role === "PRODUCER") {
      const producerName = c.className.replace(/Producer$|Sender$/, "") + "KafkaProducer";
      files.push({ path: `src/main/java/${pp}/messaging/${producerName}.java`, content: this.genProducer(c, producerName, basePackage), category: "infrastructure", technology: "JMS", sourceRef: c.filePath });
    }

    files.push({ path: `docs/migration-notes/${c.className}-jms-migration.md`, content: this.genNote(c), category: "migration_note", technology: "JMS", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  /** Convert JNDI name to clean Kafka topic: jms/queue/BMCE_NOTIFICATIONS → bmce-notifications */
  private cleanTopicName(destinationName: string): string {
    return destinationName
      .replace(/jms\/(queue|topic)\//i, '')
      .replace(/\//g, '.')
      .replace(/^jms\./, '')
      .toLowerCase()
      .replace(/_/g, '-');
  }

  private genListener(c: JmsComponent, listenerName: string, pkg: string): string {
    const topic = this.cleanTopicName(c.metadata.destinationName);
    return `package ${pkg}.messaging;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.kafka.annotation.KafkaListener;\nimport org.springframework.stereotype.Component;\n\n/** Kafka Listener migre depuis JMS ${c.metadata.role}: ${c.className}\n * Destination legacy: ${c.metadata.destinationName} (${c.metadata.destinationType})\n * Type de message: ${c.metadata.messageType}\n */\n@Component\n@RequiredArgsConstructor\n@Slf4j\npublic class ${listenerName} {\n\n    @KafkaListener(topics = "${topic}", groupId = "${pkg.split(".").pop()}-group")\n    public void onMessage(String message) {\n        log.info("Message recu sur topic {}: {}", "${topic}", message);\n        // TODO: Migrer la logique de ${c.className}.onMessage\n    }\n}\n`;
  }

  private genProducer(c: JmsComponent, producerName: string, pkg: string): string {
    const topic = this.cleanTopicName(c.metadata.destinationName);
    return `package ${pkg}.messaging;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.kafka.core.KafkaTemplate;\nimport org.springframework.stereotype.Component;\n\n/** Kafka Producer migre depuis JMS Producer: ${c.className}\n * Destination legacy: ${c.metadata.destinationName} (${c.metadata.destinationType})\n */\n@Component\n@RequiredArgsConstructor\n@Slf4j\npublic class ${producerName} {\n\n    private final KafkaTemplate<String, String> kafkaTemplate;\n\n    public void send(String message) {\n        log.info("Envoi message sur topic {}", "${topic}");\n        kafkaTemplate.send("${topic}", message);\n    }\n}\n`;
  }

  private genNote(c: JmsComponent): string {
    return `# Migration JMS -> Kafka: ${c.className}\n\n## Changements\n- **@MessageDriven / MDB** -> **@KafkaListener**\n- **JMS Queue/Topic** -> **Kafka Topic**: ${c.metadata.destinationName}\n- **ConnectionFactory** -> **KafkaTemplate (auto-configure)**\n- **MessageProducer** -> **KafkaTemplate.send()**\n- **ObjectMessage** -> **JSON serialization**\n\n## Configuration requise\n\`\`\`yaml\nspring:\n  kafka:\n    bootstrap-servers: localhost:9092\n    consumer:\n      group-id: app-group\n      auto-offset-reset: earliest\n\`\`\`\n`;
  }
}
