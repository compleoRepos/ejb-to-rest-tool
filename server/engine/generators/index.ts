import { TechnologyRegistry } from "../registry/index";
import { ServletGenerator } from "./servlet-generator";
import { Ejb2xGenerator } from "./ejb2x-generator";
import { StrutsGenerator } from "./struts-generator";
import { SoapGenerator } from "./soap-generator";
import { JdbcGenerator } from "./jdbc-generator";
import { HibernateGenerator } from "./hibernate-generator";
import { JmsGenerator } from "./jms-generator";
import { BatchGenerator } from "./batch-generator";
import { EaiGenerator } from "./eai-generator";

export function registerAllGenerators(registry: TechnologyRegistry): void {
  registry.registerGenerator(new ServletGenerator());
  registry.registerGenerator(new Ejb2xGenerator());
  registry.registerGenerator(new StrutsGenerator());
  registry.registerGenerator(new SoapGenerator());
  registry.registerGenerator(new JdbcGenerator());
  registry.registerGenerator(new HibernateGenerator());
  registry.registerGenerator(new JmsGenerator());
  registry.registerGenerator(new BatchGenerator());
  registry.registerGenerator(new EaiGenerator());
}

export {
  ServletGenerator,
  Ejb2xGenerator,
  StrutsGenerator,
  SoapGenerator,
  JdbcGenerator,
  HibernateGenerator,
  JmsGenerator,
  BatchGenerator,
  EaiGenerator,
};
