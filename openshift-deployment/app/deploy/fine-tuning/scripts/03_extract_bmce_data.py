#!/usr/bin/env python3
"""
Script 3/5 — Extrait les données de migration BMCE depuis la base de données.
Récupère les sessions Agent IA complétées, les fichiers source/générés,
les règles apprises et les choix d'ambiguïtés pour constituer le dataset.

Usage:
    python3 03_extract_bmce_data.py \
        --db-url "mysql://user:pass@host:3306/modernizer" \
        --output ./dataset/bmce_pairs

Alternative (sans DB, depuis l'API):
    python3 03_extract_bmce_data.py \
        --api-url "https://modernizer-demo.com" \
        --output ./dataset/bmce_pairs
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# ─── Extraction depuis l'API ─────────────────────────────────────────────────

class APIExtractor:
    """Extrait les données via l'API REST de l'application."""
    
    def __init__(self, api_url: str, output_dir: str):
        import requests
        self.api_url = api_url.rstrip('/')
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.requests = requests
        self.stats = {
            "sessions_extracted": 0,
            "pairs_created": 0,
            "rules_extracted": 0,
            "ambiguities_extracted": 0,
        }
    
    def get_sessions(self) -> list:
        """Récupère toutes les sessions complétées."""
        try:
            resp = self.requests.get(f"{self.api_url}/api/agent/sessions", timeout=30)
            sessions = resp.json()
            completed = [s for s in sessions if s.get("status") in ["completed", "COMPLETED"]]
            logger.info(f"Found {len(completed)} completed sessions out of {len(sessions)} total")
            return completed
        except Exception as e:
            logger.error(f"Error fetching sessions: {e}")
            return []
    
    def get_session_detail(self, session_id: str) -> dict:
        """Récupère les détails d'une session (fichiers source + générés)."""
        try:
            resp = self.requests.get(f"{self.api_url}/api/agent/{session_id}/status", timeout=30)
            return resp.json()
        except Exception as e:
            logger.error(f"Error fetching session {session_id}: {e}")
            return {}
    
    def get_compleo_sessions(self) -> list:
        """Récupère les sessions Compleo (pipeline classique)."""
        try:
            resp = self.requests.get(f"{self.api_url}/api/compleo/sessions", timeout=30)
            sessions = resp.json()
            completed = [s for s in sessions if s.get("status") in ["completed", "COMPLETED"]]
            logger.info(f"Found {len(completed)} completed Compleo sessions")
            return completed
        except Exception as e:
            logger.error(f"Error fetching Compleo sessions: {e}")
            return []
    
    def get_rules(self) -> list:
        """Récupère toutes les règles de migration apprises."""
        try:
            resp = self.requests.get(f"{self.api_url}/api/rules", timeout=30)
            rules = resp.json()
            logger.info(f"Found {len(rules)} migration rules")
            return rules
        except Exception as e:
            logger.error(f"Error fetching rules: {e}")
            return []
    
    def extract_pairs_from_session(self, session: dict) -> list:
        """Extrait les paires EJB→Spring Boot d'une session."""
        pairs = []
        session_id = session.get("id") or session.get("sessionId")
        detail = self.get_session_detail(session_id)
        
        if not detail:
            return pairs
        
        # Extraire les fichiers source et générés
        source_files = detail.get("sourceFiles") or detail.get("files", {}).get("source", [])
        generated_files = detail.get("generatedFiles") or detail.get("files", {}).get("generated", [])
        ambiguities = detail.get("ambiguities", [])
        
        # Créer des paires basées sur le mapping source → généré
        source_map = {}
        for sf in source_files:
            name = sf.get("name") or sf.get("fileName", "")
            content = sf.get("content", "")
            if name.endswith(".java") and content:
                base_name = name.replace(".java", "")
                source_map[base_name] = {
                    "name": name,
                    "content": content,
                    "type": sf.get("type", "unknown"),
                }
        
        for gf in generated_files:
            name = gf.get("name") or gf.get("fileName", "")
            content = gf.get("content", "")
            if not name.endswith(".java") or not content:
                continue
            
            # Trouver le fichier source correspondant
            base_name = name.replace("Service.java", "").replace("Controller.java", "")
            base_name = base_name.replace("Repository.java", "").replace("Dto.java", "")
            base_name = base_name.replace("Entity.java", "").replace(".java", "")
            
            # Chercher une correspondance dans les sources
            matched_source = None
            for src_name, src_data in source_map.items():
                if base_name in src_name or src_name in base_name:
                    matched_source = src_data
                    break
            
            if matched_source:
                pair = {
                    "instruction": "Migre ce composant EJB legacy vers Spring Boot en suivant les conventions BMCE Bank.",
                    "input": matched_source["content"],
                    "output": content,
                    "metadata": {
                        "source": "bmce_production",
                        "session_id": session_id,
                        "project_name": session.get("projectName") or session.get("name", "unknown"),
                        "source_file": matched_source["name"],
                        "generated_file": name,
                        "ejb_type": matched_source.get("type", "unknown"),
                    }
                }
                pairs.append(pair)
        
        # Extraire aussi les ambiguïtés résolues comme données d'entraînement
        for amb in ambiguities:
            if amb.get("resolved") or amb.get("choice"):
                amb_pair = {
                    "instruction": "Résous cette ambiguïté de migration EJB → Spring Boot.",
                    "input": json.dumps({
                        "context": amb.get("context", ""),
                        "question": amb.get("question") or amb.get("description", ""),
                        "options": amb.get("options", []),
                    }, ensure_ascii=False),
                    "output": json.dumps({
                        "choice": amb.get("choice") or amb.get("resolution", ""),
                        "reasoning": amb.get("reasoning", ""),
                    }, ensure_ascii=False),
                    "metadata": {
                        "source": "bmce_ambiguity",
                        "session_id": session_id,
                    }
                }
                pairs.append(amb_pair)
                self.stats["ambiguities_extracted"] += 1
        
        return pairs
    
    def extract_rules_as_pairs(self, rules: list) -> list:
        """Convertit les règles apprises en paires d'entraînement."""
        pairs = []
        for rule in rules:
            pair = {
                "instruction": "Applique cette règle de migration EJB → Spring Boot.",
                "input": json.dumps({
                    "pattern": rule.get("pattern") or rule.get("sourcePattern", ""),
                    "technology": rule.get("technology", ""),
                    "context": rule.get("context") or rule.get("description", ""),
                }, ensure_ascii=False),
                "output": json.dumps({
                    "replacement": rule.get("replacement") or rule.get("targetPattern", ""),
                    "explanation": rule.get("explanation", ""),
                }, ensure_ascii=False),
                "metadata": {
                    "source": "bmce_rule",
                    "rule_id": rule.get("id", ""),
                    "confidence": rule.get("confidence", 1.0),
                }
            }
            pairs.append(pair)
            self.stats["rules_extracted"] += 1
        return pairs
    
    def run(self):
        """Lance l'extraction complète."""
        logger.info("=" * 60)
        logger.info("BMCE Data Extractor — Starting")
        logger.info(f"API: {self.api_url}")
        logger.info(f"Output: {self.output_dir}")
        logger.info("=" * 60)
        
        all_pairs = []
        
        # 1. Extraire les sessions Agent IA
        logger.info("Phase 1: Extracting Agent IA sessions...")
        sessions = self.get_sessions()
        for i, session in enumerate(sessions):
            logger.info(f"  [{i+1}/{len(sessions)}] Processing session {session.get('id', 'unknown')}...")
            pairs = self.extract_pairs_from_session(session)
            all_pairs.extend(pairs)
            self.stats["sessions_extracted"] += 1
        
        # 2. Extraire les sessions Compleo
        logger.info("Phase 2: Extracting Compleo sessions...")
        compleo_sessions = self.get_compleo_sessions()
        for i, session in enumerate(compleo_sessions):
            logger.info(f"  [{i+1}/{len(compleo_sessions)}] Processing Compleo session...")
            pairs = self.extract_pairs_from_session(session)
            all_pairs.extend(pairs)
            self.stats["sessions_extracted"] += 1
        
        # 3. Extraire les règles
        logger.info("Phase 3: Extracting migration rules...")
        rules = self.get_rules()
        rule_pairs = self.extract_rules_as_pairs(rules)
        all_pairs.extend(rule_pairs)
        
        # 4. Sauvegarder
        self.stats["pairs_created"] = len(all_pairs)
        output_file = self.output_dir / "bmce_pairs.jsonl"
        with open(output_file, 'w', encoding='utf-8') as f:
            for pair in all_pairs:
                f.write(json.dumps(pair, ensure_ascii=False) + '\n')
        
        self._save_stats()
        
        logger.info("=" * 60)
        logger.info(f"Extraction complete!")
        logger.info(f"Sessions extracted: {self.stats['sessions_extracted']}")
        logger.info(f"Pairs created: {self.stats['pairs_created']}")
        logger.info(f"Rules extracted: {self.stats['rules_extracted']}")
        logger.info(f"Ambiguities extracted: {self.stats['ambiguities_extracted']}")
        logger.info(f"Output: {output_file}")
        logger.info("=" * 60)
    
    def _save_stats(self):
        stats_file = self.output_dir / "extraction_stats.json"
        stats_file.write_text(json.dumps(self.stats, indent=2), encoding='utf-8')

# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract BMCE migration data")
    parser.add_argument("--api-url", default="http://localhost:3000", help="Application API URL")
    parser.add_argument("--output", default="./dataset/bmce_pairs", help="Output directory")
    args = parser.parse_args()
    
    extractor = APIExtractor(api_url=args.api_url, output_dir=args.output)
    extractor.run()
