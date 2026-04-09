#!/usr/bin/env python3
"""
Audit complet du graphe d'architecture — vérifie la cohérence des données.
"""
import json, sys, requests
from collections import Counter, defaultdict

SESSION_ID = "_PS6YZh4xcfREoT6"  # Full session ID
BASE = "http://localhost:3000"

# 1. Lancer l'analyse
print("=" * 80)
print("AUDIT DU GRAPHE D'ARCHITECTURE")
print("=" * 80)

res = requests.post(f"{BASE}/api/architecture/analyze", json={"sessionId": SESSION_ID})
data = res.json()

if "error" in data:
    print(f"ERREUR: {data['error']}")
    sys.exit(1)

print(f"\nTop-level keys: {list(data.keys())}")

# 2. Résumé global
print("\n" + "=" * 60)
print("1. RÉSUMÉ GLOBAL")
print("=" * 60)
g = data.get("graph", {})
print(f"  Nœuds: {g.get('totalNodes')}")
print(f"  Arêtes: {g.get('totalEdges')}")
print(f"  Composantes connexes: {g.get('connectedComponents')}")
print(f"  Degré moyen: {g.get('avgDegree')}")
print(f"  Domaines: {len(data.get('domains', []))}")
print(f"  Microservices: {len(data.get('microservices', []))}")
print(f"  Entry points: {len(data.get('entryPoints', []))}")
print(f"  Exit points: {len(data.get('exitPoints', []))}")
print(f"  Flux critiques: {len(data.get('criticalFlows', []))}")
print(f"  Warnings: {data.get('warnings', [])}")

# 3. Cytoscape data
print("\n" + "=" * 60)
print("2. CYTOSCAPE DATA — NŒUDS")
print("=" * 60)
cyto = data.get("visualizations", {}).get("cytoscapeData", {})
if not cyto:
    print("  PAS DE CYTOSCAPE DATA!")
    sys.exit(1)

# Normalize
if "elements" in cyto and "nodes" not in cyto:
    elems = cyto["elements"] if isinstance(cyto["elements"], list) else []
    cyto["nodes"] = [e for e in elems if e.get("group") == "nodes"]
    cyto["edges"] = [e for e in elems if e.get("group") == "edges"]

nodes = cyto.get("nodes", [])
edges = cyto.get("edges", [])
print(f"  Total nœuds Cytoscape: {len(nodes)}")
print(f"  Total arêtes Cytoscape: {len(edges)}")

# Node analysis
node_types = Counter()
node_roles = Counter()
node_domains = Counter()
node_ids = set()
nodes_by_id = {}
for n in nodes:
    d = n.get("data", {})
    nid = d.get("id", "?")
    node_ids.add(nid)
    nodes_by_id[nid] = d
    node_types[d.get("type", "UNKNOWN")] += 1
    if d.get("role"):
        node_roles[d["role"]] += 1
    if d.get("domain"):
        node_domains[d["domain"]] += 1

print(f"\n  Types de nœuds:")
for t, c in node_types.most_common():
    print(f"    {t}: {c}")

print(f"\n  Rôles des nœuds:")
for r, c in node_roles.most_common():
    print(f"    {r}: {c}")

print(f"\n  Domaines des nœuds:")
for d, c in node_domains.most_common():
    print(f"    {d}: {c}")

# 4. Edge analysis
print("\n" + "=" * 60)
print("3. CYTOSCAPE DATA — ARÊTES")
print("=" * 60)
edge_types = Counter()
orphan_edges = []
for e in edges:
    d = e.get("data", {})
    edge_types[d.get("type", "UNKNOWN")] += 1
    src = d.get("source", "")
    tgt = d.get("target", "")
    if src not in node_ids:
        orphan_edges.append(f"  ORPHAN SOURCE: edge {d.get('id','?')} source={src} not in nodes")
    if tgt not in node_ids:
        orphan_edges.append(f"  ORPHAN TARGET: edge {d.get('id','?')} target={tgt} not in nodes")

print(f"  Types d'arêtes:")
for t, c in edge_types.most_common():
    print(f"    {t}: {c}")

if orphan_edges:
    print(f"\n  ⚠️  ARÊTES ORPHELINES ({len(orphan_edges)}):")
    for o in orphan_edges[:20]:
        print(f"    {o}")
else:
    print(f"\n  ✅ Aucune arête orpheline")

# 5. Degree analysis — orphan nodes
print("\n" + "=" * 60)
print("4. ANALYSE DE CONNECTIVITÉ")
print("=" * 60)
in_degree = Counter()
out_degree = Counter()
for e in edges:
    d = e.get("data", {})
    out_degree[d.get("source", "")] += 1
    in_degree[d.get("target", "")] += 1

isolated_nodes = []
for nid in node_ids:
    if in_degree[nid] == 0 and out_degree[nid] == 0:
        nd = nodes_by_id.get(nid, {})
        isolated_nodes.append(f"  {nid} (type={nd.get('type')}, role={nd.get('role')}, domain={nd.get('domain')})")

if isolated_nodes:
    print(f"\n  ⚠️  NŒUDS ISOLÉS (aucune arête) ({len(isolated_nodes)}):")
    for n in isolated_nodes:
        print(f"    {n}")
else:
    print(f"\n  ✅ Aucun nœud isolé")

# Leaf nodes (no outgoing edges)
leaf_nodes = []
for nid in node_ids:
    if out_degree[nid] == 0 and in_degree[nid] > 0:
        nd = nodes_by_id.get(nid, {})
        leaf_nodes.append(f"  {nid} (type={nd.get('type')}, role={nd.get('role')}, in={in_degree[nid]})")

print(f"\n  Nœuds feuilles (pas de sortie, {len(leaf_nodes)}):")
for n in leaf_nodes[:15]:
    print(f"    {n}")

# Root nodes (no incoming edges)
root_nodes = []
for nid in node_ids:
    if in_degree[nid] == 0 and out_degree[nid] > 0:
        nd = nodes_by_id.get(nid, {})
        root_nodes.append(f"  {nid} (type={nd.get('type')}, role={nd.get('role')}, out={out_degree[nid]})")

print(f"\n  Nœuds racines (pas d'entrée, {len(root_nodes)}):")
for n in root_nodes[:15]:
    print(f"    {n}")

# 6. Microservices coherence
print("\n" + "=" * 60)
print("5. COHÉRENCE DES MICROSERVICES")
print("=" * 60)
ms_list = data.get("microservices", [])
all_ms_classes = set()
for ms in ms_list:
    classes = ms.get("classes", [])
    all_ms_classes.update(classes)
    # Check if all classes exist in the graph
    missing = [c for c in classes if c not in node_ids]
    if missing:
        print(f"  ⚠️  {ms['name']}: classes manquantes dans le graphe: {missing}")
    else:
        print(f"  ✅ {ms['name']}: {len(classes)} classes, toutes dans le graphe")
    
    # Check bounded context
    ctx = ms.get("boundedContext", "")
    domains_in_ms = set()
    for c in classes:
        nd = nodes_by_id.get(c, {})
        domains_in_ms.add(nd.get("domain", "UNKNOWN"))
    if len(domains_in_ms) > 1:
        print(f"       ⚠️  Multi-domaine: {domains_in_ms} (ctx={ctx})")

# Classes not in any microservice
unassigned = node_ids - all_ms_classes
unassigned_class = [nid for nid in unassigned if nodes_by_id.get(nid, {}).get("type") == "CLASS"]
if unassigned_class:
    print(f"\n  ⚠️  Classes non assignées à un microservice ({len(unassigned_class)}):")
    for nid in unassigned_class[:10]:
        nd = nodes_by_id.get(nid, {})
        print(f"    {nid} (role={nd.get('role')}, domain={nd.get('domain')})")

# 7. Entry/Exit points coherence
print("\n" + "=" * 60)
print("6. COHÉRENCE ENTRY/EXIT POINTS")
print("=" * 60)
entry_points = data.get("entryPoints", [])
exit_points = data.get("exitPoints", [])

print(f"\n  Entry points ({len(entry_points)}):")
for ep in entry_points:
    nid = ep.get("nodeId", "")
    exists = nid in node_ids
    nd = nodes_by_id.get(nid, {})
    role = nd.get("role", "?")
    print(f"    {'✅' if exists else '⚠️'} {ep['className']}: type={ep['type']}, protocol={ep['protocol']}, role={role}, in_graph={exists}")

print(f"\n  Exit points ({len(exit_points)}):")
for ep in exit_points:
    nid = ep.get("nodeId", "")
    exists = nid in node_ids
    nd = nodes_by_id.get(nid, {})
    role = nd.get("role", "?")
    print(f"    {'✅' if exists else '⚠️'} {ep['className']}: type={ep['type']}, target={ep['target']}, role={role}, in_graph={exists}")

# 8. Cross-domain edges
print("\n" + "=" * 60)
print("7. ARÊTES INTER-DOMAINES")
print("=" * 60)
cross_domain = []
intra_domain = []
for e in edges:
    d = e.get("data", {})
    src_domain = nodes_by_id.get(d.get("source", ""), {}).get("domain", "?")
    tgt_domain = nodes_by_id.get(d.get("target", ""), {}).get("domain", "?")
    if src_domain != tgt_domain:
        cross_domain.append(f"  {d.get('source','')} ({src_domain}) --[{d.get('type','')}]--> {d.get('target','')} ({tgt_domain})")
    else:
        intra_domain.append(d)

print(f"  Arêtes intra-domaine: {len(intra_domain)}")
print(f"  Arêtes inter-domaines: {len(cross_domain)}")
if cross_domain:
    print(f"\n  Détail des arêtes inter-domaines:")
    for cd in cross_domain[:20]:
        print(f"    {cd}")

# 9. All nodes detail
print("\n" + "=" * 60)
print("8. DÉTAIL DE TOUS LES NŒUDS")
print("=" * 60)
for nid, nd in sorted(nodes_by_id.items()):
    label = nd.get("label", "?")
    ntype = nd.get("type", "?")
    role = nd.get("role", "?")
    domain = nd.get("domain", "?")
    loc = nd.get("linesOfCode", "?")
    print(f"  {nid}: label={label}, type={ntype}, role={role}, domain={domain}, LOC={loc}")

print("\n" + "=" * 60)
print("AUDIT TERMINÉ")
print("=" * 60)
