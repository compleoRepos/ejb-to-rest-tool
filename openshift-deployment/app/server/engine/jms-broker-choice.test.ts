/**
 * Tests unitaires — JmsGenerator avec choix broker (Kafka / RabbitMQ)
 * @version v11.5b
 */

import { describe, it, expect, beforeEach } from "vitest";
import { JmsGenerator, setMessagingBroker, getMessagingBroker } from "./generators/jms-generator";
import type { JmsComponent } from "./registry/types";

const makeMDB = (name: string, dest: string): JmsComponent => ({
  className: name,
  filePath: `src/${name}.java`,
  technology: "JMS",
  metadata: {
    role: "MDB",
    destinationName: dest,
    destinationType: "queue",
    messageType: "TextMessage",
    connectionFactory: "jms/ConnectionFactory",
    selector: "",
    acknowledgeMode: "AUTO_ACKNOWLEDGE",
  },
});

const makeProducer = (name: string, dest: string): JmsComponent => ({
  className: name,
  filePath: `src/${name}.java`,
  technology: "JMS",
  metadata: {
    role: "PRODUCER",
    destinationName: dest,
    destinationType: "topic",
    messageType: "ObjectMessage",
    connectionFactory: "jms/ConnectionFactory",
    selector: "",
    acknowledgeMode: "AUTO_ACKNOWLEDGE",
  },
});

describe("JmsGenerator — Broker Choice (v11.5b)", () => {
  const gen = new JmsGenerator();
  const pkg = "com.example.app";

  beforeEach(() => {
    setMessagingBroker("kafka"); // Reset to default
  });

  describe("Kafka (default)", () => {
    it("generates @KafkaListener for MDB", () => {
      setMessagingBroker("kafka");
      const mdb = makeMDB("NotificationMDB", "jms/queue/NOTIF_QUEUE");
      const files = gen.generate(mdb, [], pkg);

      const listener = files.find(f => f.path.includes("KafkaListener"));
      expect(listener).toBeDefined();
      expect(listener!.content).toContain("@KafkaListener");
      expect(listener!.content).toContain("notif-queue");
      expect(listener!.content).toContain("KafkaListener");
    });

    it("generates KafkaTemplate for Producer", () => {
      setMessagingBroker("kafka");
      const prod = makeProducer("AlertSender", "jms/topic/ALERTS");
      const files = gen.generate(prod, [], pkg);

      const producer = files.find(f => f.path.includes("KafkaProducer"));
      expect(producer).toBeDefined();
      expect(producer!.content).toContain("KafkaTemplate");
      expect(producer!.content).toContain("kafkaTemplate.send");
    });

    it("generates Kafka migration note", () => {
      setMessagingBroker("kafka");
      const mdb = makeMDB("PaymentMDB", "jms/queue/PAYMENTS");
      const files = gen.generate(mdb, [], pkg);

      const note = files.find(f => f.path.includes("migration.md"));
      expect(note).toBeDefined();
      expect(note!.content).toContain("Kafka");
      expect(note!.content).not.toContain("RabbitMQ");
    });
  });

  describe("RabbitMQ", () => {
    it("generates @RabbitListener for MDB", () => {
      setMessagingBroker("rabbitmq");
      const mdb = makeMDB("NotificationMDB", "jms/queue/NOTIF_QUEUE");
      const files = gen.generate(mdb, [], pkg);

      const listener = files.find(f => f.path.includes("RabbitListener"));
      expect(listener).toBeDefined();
      expect(listener!.content).toContain("@RabbitListener");
      expect(listener!.content).toContain("queues = \"notif-queue\"");
      expect(listener!.content).not.toContain("KafkaListener");
    });

    it("generates RabbitTemplate for Producer", () => {
      setMessagingBroker("rabbitmq");
      const prod = makeProducer("AlertSender", "jms/topic/ALERTS");
      const files = gen.generate(prod, [], pkg);

      const producer = files.find(f => f.path.includes("RabbitProducer"));
      expect(producer).toBeDefined();
      expect(producer!.content).toContain("RabbitTemplate");
      expect(producer!.content).toContain("convertAndSend");
      expect(producer!.content).toContain("exchange");
      expect(producer!.content).toContain("routing");
    });

    it("generates RabbitMQ migration note", () => {
      setMessagingBroker("rabbitmq");
      const mdb = makeMDB("PaymentMDB", "jms/queue/PAYMENTS");
      const files = gen.generate(mdb, [], pkg);

      const note = files.find(f => f.path.includes("migration.md"));
      expect(note).toBeDefined();
      expect(note!.content).toContain("RabbitMQ");
      expect(note!.content).toContain("@RabbitListener");
      expect(note!.content).not.toContain("@KafkaListener");
    });

    it("generates exchange and routing key in producer", () => {
      setMessagingBroker("rabbitmq");
      const prod = makeProducer("OrderSender", "jms/queue/ORDER_EVENTS");
      const files = gen.generate(prod, [], pkg);

      const producer = files.find(f => f.path.includes("RabbitProducer"));
      expect(producer!.content).toContain("order-events-exchange");
      expect(producer!.content).toContain("order-events.routing");
    });
  });

  describe("Broker state management", () => {
    it("getMessagingBroker returns current broker", () => {
      setMessagingBroker("rabbitmq");
      expect(getMessagingBroker()).toBe("rabbitmq");

      setMessagingBroker("kafka");
      expect(getMessagingBroker()).toBe("kafka");
    });

    it("defaults to kafka", () => {
      // After beforeEach reset
      expect(getMessagingBroker()).toBe("kafka");
    });
  });

  describe("File naming", () => {
    it("uses KafkaListener suffix for kafka", () => {
      setMessagingBroker("kafka");
      const mdb = makeMDB("PaymentMDB", "jms/queue/PAY");
      const files = gen.generate(mdb, [], pkg);
      expect(files.some(f => f.path.includes("PaymentKafkaListener"))).toBe(true);
    });

    it("uses RabbitListener suffix for rabbitmq", () => {
      setMessagingBroker("rabbitmq");
      const mdb = makeMDB("PaymentMDB", "jms/queue/PAY");
      const files = gen.generate(mdb, [], pkg);
      expect(files.some(f => f.path.includes("PaymentRabbitListener"))).toBe(true);
    });

    it("strips MDB/Bean suffix from class name", () => {
      setMessagingBroker("kafka");
      const mdb = makeMDB("AlertBean", "jms/queue/ALERTS");
      const files = gen.generate(mdb, [], pkg);
      expect(files.some(f => f.path.includes("AlertKafkaListener"))).toBe(true);
    });
  });
});
