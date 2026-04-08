/**
 * Detecteur JMS (@MessageDriven, MessageListener, ConnectionFactory).
 * Tier 1 - Cible : Spring Kafka / RabbitMQ.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  JmsComponent,
  DetectedMethod,
} from "../registry/types";

export class JmsDetector implements TechnologyDetector {
  readonly technology = "JMS" as const;
  readonly tier = 1 as const;
  readonly label = "JMS";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /@MessageDriven/.test(content) ||
      /implements\s+MessageListener/.test(content) ||
      /import\s+javax\.jms/.test(content) ||
      /import\s+jakarta\.jms/.test(content) ||
      /ConnectionFactory/.test(content) ||
      /MessageProducer/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Determiner le role
    const isMDB = /@MessageDriven/.test(content) || /implements\s+MessageListener/.test(content);
    const isProducer = /MessageProducer/.test(content) || /\.send\(/.test(content);
    const role: "MDB" | "PRODUCER" | "CONSUMER" = isMDB ? "MDB" : isProducer ? "PRODUCER" : "CONSUMER";

    // Extraire la destination
    let destinationType: "QUEUE" | "TOPIC" = "QUEUE";
    let destinationName = "unknown";

    const destMatch = content.match(/destination\s*=\s*"([^"]+)"/);
    if (destMatch) destinationName = destMatch[1];

    const destTypeMatch = content.match(/destinationType\s*=\s*"([^"]+)"/);
    if (destTypeMatch) {
      destinationType = destTypeMatch[1].includes("Topic") ? "TOPIC" : "QUEUE";
    }

    const mappedMatch = content.match(/mappedName\s*=\s*"([^"]+)"/);
    if (mappedMatch && destinationName === "unknown") destinationName = mappedMatch[1];

    // JNDI lookup
    const jndiMatch = content.match(/lookup\s*\(\s*"([^"]+Queue[^"]*)"\s*\)/);
    if (jndiMatch && destinationName === "unknown") destinationName = jndiMatch[1];
    const topicJndi = content.match(/lookup\s*\(\s*"([^"]*Topic[^"]*)"\s*\)/);
    if (topicJndi) {
      destinationType = "TOPIC";
      if (destinationName === "unknown") destinationName = topicJndi[1];
    }

    // Extraire le type de message
    let messageType = "TextMessage";
    if (/ObjectMessage/.test(content)) messageType = "ObjectMessage";
    if (/MapMessage/.test(content)) messageType = "MapMessage";
    if (/BytesMessage/.test(content)) messageType = "BytesMessage";

    // Extraire les methodes
    const methods: DetectedMethod[] = [];
    if (isMDB) {
      methods.push({
        name: "onMessage",
        returnType: "void",
        params: [{ name: "message", type: "Message" }],
        annotations: ["@Override"],
      });
    }

    const component: JmsComponent = {
      technology: "JMS",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(role, destinationName),
      metadata: {
        role,
        destinationType,
        destinationName,
        messageType,
        methods,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private computeConfidence(role: string, destinationName: string): number {
    let score = 70;
    if (role === "MDB") score += 15;
    if (destinationName !== "unknown") score += 10;
    return Math.min(score, 99);
  }
}
