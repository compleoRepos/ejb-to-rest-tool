/**
 * Registre de tous les detecteurs multi-technologies.
 * Chaque detecteur est enregistre dans le TechnologyRegistry.
 */
import { TechnologyRegistry } from "../registry/index";
import { ServletDetector } from "./servlet-detector";
import { JspDetector } from "./jsp-detector";
import { Ejb2xDetector } from "./ejb2x-detector";
import { Ejb3xDetector } from "./ejb3x-detector";
import { StrutsDetector } from "./struts-detector";
import { SoapDetector } from "./soap-detector";
import { JaxRsDetector } from "./jaxrs-detector";
import { JdbcDetector } from "./jdbc-detector";
import { HibernateDetector } from "./hibernate-detector";
import { JpaDetector } from "./jpa-detector";
import { JmsDetector } from "./jms-detector";
import { BatchDetector } from "./batch-detector";
import { EaiDetector } from "./eai-detector";

/**
 * Enregistre tous les detecteurs dans le registry.
 */
export function registerAllDetectors(registry: TechnologyRegistry): void {
  // Tier 1 - Technologies legacy majeures
  registry.registerDetector(new ServletDetector());
  registry.registerDetector(new Ejb2xDetector());
  registry.registerDetector(new Ejb3xDetector());
  registry.registerDetector(new StrutsDetector());
  registry.registerDetector(new SoapDetector());
  registry.registerDetector(new JdbcDetector());
  registry.registerDetector(new HibernateDetector());
  registry.registerDetector(new JmsDetector());
  registry.registerDetector(new BatchDetector());
  registry.registerDetector(new EaiDetector());

  // Tier 2 - Technologies deja proches de Spring
  registry.registerDetector(new JaxRsDetector());
  registry.registerDetector(new JspDetector());
  registry.registerDetector(new JpaDetector());
}

export {
  ServletDetector,
  JspDetector,
  Ejb2xDetector,
  Ejb3xDetector,
  StrutsDetector,
  SoapDetector,
  JaxRsDetector,
  JdbcDetector,
  HibernateDetector,
  JpaDetector,
  JmsDetector,
  BatchDetector,
  EaiDetector,
};
