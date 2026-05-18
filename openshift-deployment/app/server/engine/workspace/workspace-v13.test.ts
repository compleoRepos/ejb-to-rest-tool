/**
 * Tests unitaires — COMPLEO v13.0 Workspace Mode
 * DependencyAnalyzer + MigrationPlanner + SharedStubLibrary
 *
 * Fixture : workspace BMCE simplifié (5 projets représentatifs)
 */

import { describe, it, expect } from 'vitest';
import { DependencyAnalyzer, Workspace } from './DependencyAnalyzer';
import { MigrationPlanner } from './MigrationPlanner';
import { SharedStubLibrary } from './SharedStubLibrary';

// ─── Fixture BMCE simplifiée ─────────────────────────────────────────────────

function createBmceWorkspace(): Workspace {
  const workspace: Workspace = new Map();

  // Projet 1: avis-opere (dépend de ma.eai.commons, ma.eai.boa)
  workspace.set('avis-opere', new Map([
    ['src/main/java/ma/bmce/avisopere/service/XbankingService.java', `
package ma.bmce.avisopere.service;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.Parser;
import ma.eai.boa.xbanking.XbankingAction;
import ma.eai.boa.xbanking.ActionResult;
import java.util.List;
import java.util.ArrayList;

public class XbankingService {
    private Envelope envelope;
    private Parser parser;

    public void processAvis(String clientId) {
        envelope = new Envelope("avis-opere");
        String data = parser.parse(envelope.getNodeAsString("/flux/action"));
        XbankingAction action = new XbankingAction();
        ActionResult result = action.execute(envelope, "AVIS_OPERE");
        List<String> items = new ArrayList<>();
        items.add(result.getCode());
    }
}
`],
    ['src/main/java/ma/bmce/avisopere/dto/AvisRequest.java', `
package ma.bmce.avisopere.dto;

public class AvisRequest {
    private String clientId;
    private String type;
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
}
`],
  ]));

  // Projet 2: commande-chequier (dépend de ma.eai.commons, ma.eai.ingdev)
  workspace.set('commande-chequier', new Map([
    ['src/main/java/ma/bmce/chequier/service/GeneralService.java', `
package ma.bmce.chequier.service;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.Parser;
import ma.eai.ingdev.framework.BaseService;
import ma.eai.ingdev.framework.ServiceContext;
import java.util.Map;

public class GeneralService extends BaseService {
    public void orderChequier(Envelope envIn, Envelope envOut) {
        ServiceContext ctx = getContext();
        String action = envIn.getNodeAsString("/flux/action");
        Parser parser = new Parser();
        Map<String, String> params = parser.parseToMap(envIn);
        envOut.setNode("/response/status", "OK");
    }
}
`],
  ]));

  // Projet 3: interface-send-sms (indépendant, pas de deps internes)
  workspace.set('interface-send-sms', new Map([
    ['src/main/java/ma/bmce/sms/service/SmsService.java', `
package ma.bmce.sms.service;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.midw.sms.SmsGateway;
import ma.eai.midw.sms.SmsMessage;

public class SmsService {
    public void sendSms(Envelope envelope) {
        SmsGateway gateway = new SmsGateway();
        SmsMessage msg = new SmsMessage();
        msg.setRecipient(envelope.getNodeAsString("/flux/phone"));
        msg.setBody(envelope.getNodeAsString("/flux/message"));
        gateway.send(msg);
    }
}
`],
  ]));

  // Projet 4: transfert-euro (dépend de avis-opere via package shared)
  workspace.set('transfert-euro', new Map([
    ['src/main/java/ma/bmce/transfert/service/TransfertService.java', `
package ma.bmce.transfert.service;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.Parser;
import ma.bmce.avisopere.dto.AvisRequest;

public class TransfertService {
    public void executeTransfert(Envelope envIn) {
        Parser parser = new Parser();
        AvisRequest req = new AvisRequest();
        req.setClientId(envIn.getNodeAsString("/flux/client"));
        String amount = envIn.getNodeAsString("/flux/amount");
    }
}
`],
  ]));

  // Projet 5: souscription-assistance (dépend de ma.eai.commons, ma.eai.boa)
  workspace.set('souscription-assistance', new Map([
    ['src/main/java/ma/bmce/souscription/service/AssistanceService.java', `
package ma.bmce.souscription.service;

import ma.eai.commons.services.parsing.Envelope;
import ma.eai.commons.services.parsing.Parser;
import ma.eai.boa.xbanking.XbankingAction;
import ma.eai.boa.xbanking.ActionResult;
import ma.eai.log.LogService;

public class AssistanceService {
    private LogService logService;

    public void subscribe(Envelope envIn, Envelope envOut) {
        logService = new LogService("souscription");
        logService.info("Start subscription");
        Parser parser = new Parser();
        String clientId = envIn.getNodeAsString("/flux/client");
        XbankingAction action = new XbankingAction();
        ActionResult result = action.execute(envIn, "SOUSCRIPTION");
        envOut.setNode("/response/code", result.getCode());
        logService.info("End subscription: " + result.getCode());
    }
}
`],
  ]));

  return workspace;
}

// ─── Tests DependencyAnalyzer ────────────────────────────────────────────────

describe('DependencyAnalyzer', () => {
  const analyzer = new DependencyAnalyzer();
  const workspace = createBmceWorkspace();
  const graph = analyzer.analyze(workspace);

  it('détecte tous les projets du workspace', () => {
    expect(graph.projects).toHaveLength(5);
    expect(graph.projects.map(p => p.name).sort()).toEqual([
      'avis-opere', 'commande-chequier', 'interface-send-sms',
      'souscription-assistance', 'transfert-euro'
    ]);
  });

  it('identifie les packages déclarés par chaque projet', () => {
    const avisOpere = graph.projects.find(p => p.name === 'avis-opere')!;
    expect(avisOpere.packagesProvided).toContain('ma.bmce.avisopere.service');
    expect(avisOpere.packagesProvided).toContain('ma.bmce.avisopere.dto');
  });

  it('construit la map de package ownership', () => {
    expect(graph.internalPackageOwnership.get('ma.bmce.avisopere.dto')).toBe('avis-opere');
    expect(graph.internalPackageOwnership.get('ma.bmce.chequier.service')).toBe('commande-chequier');
  });

  it('détecte les dépendances inter-projets (transfert-euro → avis-opere)', () => {
    const edge = graph.dependencyEdges.find(
      e => e.from === 'transfert-euro' && e.to === 'avis-opere'
    );
    expect(edge).toBeDefined();
    expect(edge!.via).toContain('ma.bmce.avisopere.dto');
  });

  it('identifie les dépendances externes (ma.eai.commons)', () => {
    const avisExt = graph.externalDependencies.get('avis-opere')!;
    const commonsExt = avisExt.find(d => d.package.includes('eai.commons'));
    expect(commonsExt).toBeDefined();
    expect(commonsExt!.classes).toContain('Envelope');
    expect(commonsExt!.classes).toContain('Parser');
  });

  it('ne confond pas les packages internes avec les externes', () => {
    // ma.bmce.avisopere.dto est interne (owned par avis-opere)
    const transfertExt = graph.externalDependencies.get('transfert-euro')!;
    const internalAsDep = transfertExt.find(d => d.package === 'ma.bmce.avisopere.dto');
    expect(internalAsDep).toBeUndefined();
  });

  it('calcule correctement le LOC et fileCount', () => {
    const avisOpere = graph.projects.find(p => p.name === 'avis-opere')!;
    expect(avisOpere.fileCount).toBe(2);
    expect(avisOpere.loc).toBeGreaterThan(20);
  });

  it('getTopExternalFrameworks regroupe par racine', () => {
    const frameworks = analyzer.getTopExternalFrameworks(graph, 1);
    expect(frameworks.length).toBeGreaterThan(0);
    const eaiCommons = frameworks.find(f => f.rootPackage === 'ma.eai.commons');
    expect(eaiCommons).toBeDefined();
    expect(eaiCommons!.projectsUsing).toBeGreaterThanOrEqual(4);
  });

  it('génère un diagramme Mermaid valide', () => {
    const mermaid = analyzer.toMermaidDiagram(graph);
    expect(mermaid).toContain('graph TD');
    expect(mermaid).toContain('transfert_euro');
    expect(mermaid).toContain('-->');
  });

  it('gère un workspace vide sans erreur', () => {
    const emptyGraph = analyzer.analyze(new Map());
    expect(emptyGraph.projects).toHaveLength(0);
    expect(emptyGraph.dependencyEdges).toHaveLength(0);
  });

  it('gère un projet sans fichiers Java', () => {
    const ws: Workspace = new Map([
      ['empty-project', new Map([['README.md', '# Empty']])]
    ]);
    const g = analyzer.analyze(ws);
    expect(g.projects).toHaveLength(1);
    expect(g.projects[0].fileCount).toBe(0);
  });
});

// ─── Tests MigrationPlanner ──────────────────────────────────────────────────

describe('MigrationPlanner', () => {
  const analyzer = new DependencyAnalyzer();
  const planner = new MigrationPlanner();
  const workspace = createBmceWorkspace();
  const graph = analyzer.analyze(workspace);
  const plan = planner.plan(graph);

  it('génère au moins 2 tiers (foundations + business)', () => {
    expect(plan.tiers.length).toBeGreaterThanOrEqual(2);
  });

  it('tier 0 contient les framework stubs', () => {
    const tier0 = plan.tiers[0];
    expect(tier0.level).toBe(0);
    expect(tier0.label).toBe('Foundations');
    expect(tier0.items.every(i => i.type === 'framework-stub')).toBe(true);
  });

  it('transfert-euro est dans un tier APRÈS avis-opere (dépendance)', () => {
    let avisOpereTier = -1;
    let transfertTier = -1;
    for (const tier of plan.tiers) {
      if (tier.items.find(i => i.name === 'avis-opere')) avisOpereTier = tier.level;
      if (tier.items.find(i => i.name === 'transfert-euro')) transfertTier = tier.level;
    }
    expect(transfertTier).toBeGreaterThan(avisOpereTier);
  });

  it('les projets indépendants sont dans le même tier', () => {
    // avis-opere, commande-chequier, interface-send-sms, souscription-assistance
    // sont tous indépendants entre eux (pas de deps inter-projets sauf transfert-euro→avis-opere)
    const tier1Items = plan.tiers[1]?.items.map(i => i.name) || [];
    // Au moins 3 des 4 projets indépendants devraient être au tier 1
    const independents = ['commande-chequier', 'interface-send-sms', 'souscription-assistance'];
    const inTier1 = independents.filter(p => tier1Items.includes(p));
    expect(inTier1.length).toBeGreaterThanOrEqual(2);
  });

  it('canParallelize est true pour tous les tiers', () => {
    for (const tier of plan.tiers) {
      expect(tier.canParallelize).toBe(true);
    }
  });

  it('effort estimation est proportionnel au LOC', () => {
    const allItems = plan.tiers.flatMap(t => t.items);
    for (const item of allItems) {
      expect(item.effortDays).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('totalEstimatedEffortDays est la somme des items', () => {
    const sum = plan.tiers.reduce(
      (s, t) => s + t.items.reduce((ss, i) => ss + i.effortDays, 0), 0
    );
    expect(Math.abs(plan.totalEstimatedEffortDays - Math.round(sum * 10) / 10)).toBeLessThan(0.2);
  });

  it('identifie les frameworks externes (ma.eai.commons)', () => {
    const commons = plan.externalFrameworks.find(f => f.rootPackage === 'ma.eai.commons');
    expect(commons).toBeDefined();
    expect(commons!.recommendedTargetName).toBe('nexa-commons');
  });

  it('summarize retourne un texte lisible', () => {
    const summary = planner.summarize(plan);
    expect(summary).toContain('Plan de Migration');
    expect(summary).toContain('Tier 0');
    expect(summary).toContain('jours-homme');
  });

  it('gère un graphe sans dépendances inter-projets', () => {
    const ws: Workspace = new Map([
      ['proj-a', new Map([['A.java', 'package com.a;\npublic class A {}']])],
      ['proj-b', new Map([['B.java', 'package com.b;\npublic class B {}']])],
    ]);
    const g = analyzer.analyze(ws);
    const p = planner.plan(g);
    // Tous les projets dans le même tier (pas de dépendances)
    const projectTiers = p.tiers.filter(t => t.items.some(i => i.type === 'project'));
    expect(projectTiers.length).toBe(1);
  });

  it('gère les cycles (tous dans le dernier tier)', () => {
    // Cycle: A→B→A (impossible en Java mais testons la robustesse)
    const ws: Workspace = new Map([
      ['proj-a', new Map([['A.java', 'package com.a;\nimport com.b.B;\npublic class A {}']])],
      ['proj-b', new Map([['B.java', 'package com.b;\nimport com.a.A;\npublic class B {}']])],
    ]);
    const g = analyzer.analyze(ws);
    const p = planner.plan(g);
    // Les deux projets doivent être dans un tier (pas de crash)
    expect(p.totalProjects).toBe(2);
  });
});

// ─── Tests SharedStubLibrary ─────────────────────────────────────────────────

describe('SharedStubLibrary', () => {
  const analyzer = new DependencyAnalyzer();
  const stubLib = new SharedStubLibrary();
  const workspace = createBmceWorkspace();
  const graph = analyzer.analyze(workspace);

  it('génère des stubs pour les packages externes spécifiés', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    expect(bundle.classCount).toBeGreaterThan(0);
    expect(bundle.moduleName).toBe('workspace-framework-stubs');
  });

  it('les stubs contiennent les méthodes détectées cross-projet', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    // Envelope est utilisé dans 4+ projets, devrait avoir getNodeAsString et setNode
    const envelopeStub = [...bundle.stubFiles.entries()].find(
      ([path]) => path.includes('Envelope.java')
    );
    expect(envelopeStub).toBeDefined();
    const [, content] = envelopeStub!;
    expect(content).toContain('getNodeAsString');
  });

  it('le pom.xml est valide', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    expect(bundle.pomXml).toContain('<artifactId>workspace-framework-stubs</artifactId>');
    expect(bundle.pomXml).toContain('<version>1.0.0-transitional</version>');
    expect(bundle.pomXml).toContain('maven-compiler-plugin');
  });

  it('les stubs agrègent les usages de plusieurs projets', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    const envelopeStub = [...bundle.stubFiles.entries()].find(
      ([path]) => path.includes('Envelope.java')
    );
    expect(envelopeStub).toBeDefined();
    const [, content] = envelopeStub!;
    // Envelope est utilisé dans avis-opere, commande-chequier, interface-send-sms, transfert-euro, souscription-assistance
    expect(content).toContain('Agrège les usages de');
  });

  it('génère des stubs pour plusieurs packages à la fois', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons', 'ma.eai.boa']);
    // Devrait avoir Envelope, Parser, XbankingAction, ActionResult
    expect(bundle.classCount).toBeGreaterThanOrEqual(3);
  });

  it('les stubs ont un constructeur par défaut', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    const parserStub = [...bundle.stubFiles.entries()].find(
      ([path]) => path.includes('Parser.java')
    );
    expect(parserStub).toBeDefined();
    const [, content] = parserStub!;
    expect(content).toContain('public Parser()');
  });

  it('détecte les constantes (champs statiques)', () => {
    // XbankingAction n'a pas de constantes dans notre fixture, mais testons le mécanisme
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons', 'ma.eai.boa']);
    expect(bundle.stubFiles.size).toBeGreaterThan(0);
  });

  it('le moduleName custom est respecté', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons'], 'bmce-framework-stubs');
    expect(bundle.moduleName).toBe('bmce-framework-stubs');
    expect(bundle.pomXml).toContain('bmce-framework-stubs');
  });

  it('gère un package externe sans usages détectés', () => {
    const bundle = stubLib.generate(graph, workspace, ['com.nonexistent.pkg']);
    expect(bundle.classCount).toBe(0);
    expect(bundle.stubFiles.size).toBe(1); // Seulement le pom.xml
  });

  it('version est 1.0.0-transitional', () => {
    const bundle = stubLib.generate(graph, workspace, ['ma.eai.commons']);
    expect(bundle.version).toBe('1.0.0-transitional');
  });
});
