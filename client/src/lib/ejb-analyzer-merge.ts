/**
 * EJB Client Modernizer — Fusion de rapports d'analyse multi-fichiers.
 * Permet de combiner les résultats d'analyse de plusieurs fichiers Java
 * en un seul rapport consolidé.
 *
 * @author Hamza NORDINE
 */

import type { AnalysisReport } from "./ejb-analyzer";

/**
 * Fusionne plusieurs rapports d'analyse en un seul rapport consolidé.
 * Les injections, lookups, appels, transactions et éléments JMS sont combinés.
 * Les services détectés sont dédupliqués.
 */
export function mergeReports(reports: AnalysisReport[]): AnalysisReport {
  if (reports.length === 0) {
    return {
      fileName: "Aucun fichier",
      className: "",
      packageName: "",
      ejbInjections: [],
      jndiLookups: [],
      methodCalls: [],
      transactions: [],
      jmsElements: [],
      dependencies: [],
      summary: {
        totalEjbInjections: 0,
        totalJndiLookups: 0,
        totalMethodCalls: 0,
        totalTransactions: 0,
        totalJmsElements: 0,
        totalDependencies: 0,
        servicesDetected: [],
      },
    };
  }

  if (reports.length === 1) {
    return reports[0];
  }

  const merged: AnalysisReport = {
    fileName: `${reports.length} fichiers analysés`,
    className: reports.map((r) => r.className).filter(Boolean).join(", "),
    packageName: reports[0].packageName,
    ejbInjections: [],
    jndiLookups: [],
    methodCalls: [],
    transactions: [],
    jmsElements: [],
    dependencies: [],
    summary: {
      totalEjbInjections: 0,
      totalJndiLookups: 0,
      totalMethodCalls: 0,
      totalTransactions: 0,
      totalJmsElements: 0,
      totalDependencies: 0,
      servicesDetected: [],
    },
  };

  const servicesSet = new Set<string>();

  for (const report of reports) {
    merged.ejbInjections.push(...report.ejbInjections);
    merged.jndiLookups.push(...report.jndiLookups);
    merged.methodCalls.push(...report.methodCalls);
    merged.transactions.push(...report.transactions);
    merged.jmsElements.push(...report.jmsElements);
    merged.dependencies.push(...report.dependencies);

    for (const svc of report.summary.servicesDetected) {
      servicesSet.add(svc);
    }
  }

  merged.summary = {
    totalEjbInjections: merged.ejbInjections.length,
    totalJndiLookups: merged.jndiLookups.length,
    totalMethodCalls: merged.methodCalls.length,
    totalTransactions: merged.transactions.length,
    totalJmsElements: merged.jmsElements.length,
    totalDependencies: merged.dependencies.length,
    servicesDetected: Array.from(servicesSet),
  };

  return merged;
}

/**
 * Génère un rapport Markdown consolidé pour plusieurs fichiers.
 */
export function generateMultiFileMarkdownReport(
  reports: AnalysisReport[],
  mergedReport: AnalysisReport
): string {
  let md = `# Rapport d'Analyse Consolidé — ${reports.length} fichier(s)\n\n`;
  md += `**Auteur de l'outil** : Hamza NORDINE\n\n`;
  md += `**Fichiers analysés** : ${reports.map((r) => "`" + r.fileName + "`").join(", ")}\n\n`;

  md += `## Résumé Global\n\n`;
  md += `| Élément | Nombre |\n`;
  md += `| :--- | :---: |\n`;
  md += `| Injections @EJB | ${mergedReport.summary.totalEjbInjections} |\n`;
  md += `| Lookups JNDI | ${mergedReport.summary.totalJndiLookups} |\n`;
  md += `| Appels de méthodes | ${mergedReport.summary.totalMethodCalls} |\n`;
  md += `| Transactions | ${mergedReport.summary.totalTransactions} |\n`;
  md += `| Éléments JMS/MQ/Batch | ${mergedReport.summary.totalJmsElements} |\n`;
  md += `| Dépendances entre services | ${mergedReport.summary.totalDependencies} |\n\n`;
  md += `**Services détectés** : ${mergedReport.summary.servicesDetected.join(", ")}\n\n`;

  md += `---\n\n`;

  // Détail par fichier
  for (const report of reports) {
    md += `## ${report.fileName}\n\n`;
    md += `**Classe** : \`${report.className}\` **Package** : \`${report.packageName}\`\n\n`;

    if (report.ejbInjections.length > 0) {
      md += `### Injections EJB\n\n`;
      for (const inj of report.ejbInjections) {
        md += `- **Ligne ${inj.lineNumber}** : \`${inj.serviceType} ${inj.fieldName}\`\n`;
      }
      md += `\n`;
    }

    if (report.jndiLookups.length > 0) {
      md += `### Lookups JNDI\n\n`;
      for (const lookup of report.jndiLookups) {
        md += `- **Ligne ${lookup.lineNumber}** : \`${lookup.serviceType}\` via \`${lookup.jndiName}\`\n`;
      }
      md += `\n`;
    }

    if (report.methodCalls.length > 0) {
      md += `### Appels de Méthodes\n\n`;
      md += `| Service | Méthode | Paramètres | Type Retour | Ligne |\n`;
      md += `| :--- | :--- | :--- | :--- | :---: |\n`;
      for (const call of report.methodCalls) {
        md += `| ${call.serviceName} | ${call.methodName} | ${call.parameters.join(", ")} | ${call.returnType} | ${call.lineNumber} |\n`;
      }
      md += `\n`;
    }

    if (report.transactions.length > 0) {
      md += `### Transactions\n\n`;
      for (const tx of report.transactions) {
        md += `- **Ligne ${tx.lineNumber}** : \`${tx.annotation}\` (${tx.scope})\n`;
      }
      md += `\n`;
    }

    if (report.jmsElements.length > 0) {
      md += `### Éléments JMS/MQ/Batch\n\n`;
      for (const jms of report.jmsElements) {
        md += `- **Ligne ${jms.lineNumber}** : [${jms.type.toUpperCase()}] ${jms.description}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Mapping REST global
  if (mergedReport.methodCalls.length > 0) {
    md += `## Mapping REST Proposé (Global)\n\n`;
    md += `| Service EJB | Méthode | Verbe HTTP | Endpoint REST |\n`;
    md += `| :--- | :--- | :---: | :--- |\n`;

    const seen = new Set<string>();
    for (const call of mergedReport.methodCalls) {
      const key = `${call.serviceName}.${call.methodName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const verb = call.methodName.startsWith("get") || call.methodName.startsWith("find") || call.methodName.startsWith("list") ? "GET" : "POST";
      const resource = call.serviceName.replace(/Service$/, "").replace(/Bean$/, "").toLowerCase() + "s";
      md += `| ${call.serviceName} | ${call.methodName} | ${verb} | /api/v1/${resource} |\n`;
    }
    md += `\n`;
  }

  return md;
}
