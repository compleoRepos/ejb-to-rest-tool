#!/usr/bin/env python3
"""
Script 4/5 — Formate et fusionne tous les datasets en un JSONL final pour QLoRA.
Combine les paires BMCE + synthétiques GitHub, déduplique, valide la qualité,
et produit le fichier d'entraînement final au format ChatML.

Usage:
    python3 04_format_dataset.py \
        --bmce ./dataset/bmce_pairs/bmce_pairs.jsonl \
        --synthetic ./dataset/synthetic_pairs/synthetic_pairs.jsonl \
        --output ./dataset/final \
        --format chatml \
        --val-split 0.05

Formats supportés:
    - chatml: Format ChatML (pour Qwen, Llama, Mistral)
    - alpaca: Format Alpaca (instruction/input/output)
    - sharegpt: Format ShareGPT (conversations)
"""

import os
import sys
import json
import random
import hashlib
import argparse
import logging
from pathlib import Path
from collections import Counter

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# ─── Validation ──────────────────────────────────────────────────────────────

def validate_pair(pair: dict) -> tuple:
    """Valide la qualité d'une paire d'entraînement. Retourne (is_valid, reason)."""
    instruction = pair.get("instruction", "")
    input_text = pair.get("input", "")
    output_text = pair.get("output", "")
    
    # Vérifications de base
    if not instruction or not input_text or not output_text:
        return False, "missing_fields"
    
    if len(input_text) < 50:
        return False, "input_too_short"
    
    if len(output_text) < 50:
        return False, "output_too_short"
    
    if len(input_text) > 16000:
        return False, "input_too_long"
    
    if len(output_text) > 16000:
        return False, "output_too_long"
    
    # Vérifier que l'input contient du Java
    java_indicators = ["class ", "public ", "private ", "import ", "void ", "String ", "@"]
    has_java = sum(1 for ind in java_indicators if ind in input_text)
    if has_java < 2:
        return False, "input_not_java"
    
    # Vérifier que l'output contient du Spring Boot (pour les paires code)
    if "metadata" in pair:
        source = pair["metadata"].get("source", "")
        if source in ["github_synthetic", "bmce_production"]:
            spring_indicators = [
                "@Service", "@Component", "@Repository", "@Controller",
                "@RestController", "@Autowired", "@Transactional",
                "springframework", "@Bean", "@Configuration",
                "JdbcTemplate", "@JmsListener", "@RequestMapping",
                "@GetMapping", "@PostMapping",
            ]
            has_spring = sum(1 for ind in spring_indicators if ind in output_text)
            if has_spring < 1:
                return False, "output_not_spring"
    
    # Vérifier que input != output (pas de copie)
    if input_text.strip() == output_text.strip():
        return False, "input_equals_output"
    
    return True, "valid"

def deduplicate(pairs: list) -> list:
    """Déduplique les paires basé sur le hash de l'input."""
    seen = set()
    unique = []
    for pair in pairs:
        h = hashlib.md5(pair.get("input", "").encode()).hexdigest()[:16]
        if h not in seen:
            seen.add(h)
            unique.append(pair)
    return unique

# ─── Formatage ───────────────────────────────────────────────────────────────

def to_chatml(pair: dict) -> dict:
    """Convertit en format ChatML (compatible Qwen, Llama, Mistral)."""
    return {
        "messages": [
            {
                "role": "system",
                "content": "Tu es un expert en migration Java EE/EJB vers Spring Boot. "
                          "Tu produis du code Spring Boot moderne, propre et compilable "
                          "en suivant les meilleures pratiques (injection constructeur, "
                          "@Transactional, Lombok, Spring Data JPA)."
            },
            {
                "role": "user",
                "content": f"{pair['instruction']}\n\n{pair['input']}"
            },
            {
                "role": "assistant",
                "content": pair["output"]
            }
        ]
    }

def to_alpaca(pair: dict) -> dict:
    """Convertit en format Alpaca."""
    return {
        "instruction": pair["instruction"],
        "input": pair["input"],
        "output": pair["output"],
    }

def to_sharegpt(pair: dict) -> dict:
    """Convertit en format ShareGPT."""
    return {
        "conversations": [
            {"from": "system", "value": "Tu es un expert en migration Java EE/EJB vers Spring Boot."},
            {"from": "human", "value": f"{pair['instruction']}\n\n{pair['input']}"},
            {"from": "gpt", "value": pair["output"]},
        ]
    }

FORMATTERS = {
    "chatml": to_chatml,
    "alpaca": to_alpaca,
    "sharegpt": to_sharegpt,
}

# ─── Pipeline principal ─────────────────────────────────────────────────────

class DatasetFormatter:
    def __init__(self, output_dir: str, fmt: str = "chatml", val_split: float = 0.05):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.format = fmt
        self.val_split = val_split
        self.formatter = FORMATTERS[fmt]
        self.stats = {
            "total_loaded": 0,
            "after_dedup": 0,
            "valid": 0,
            "invalid": 0,
            "invalid_reasons": {},
            "train_size": 0,
            "val_size": 0,
            "by_source": {},
            "by_type": {},
        }
    
    def load_jsonl(self, filepath: str) -> list:
        """Charge un fichier JSONL."""
        pairs = []
        path = Path(filepath)
        if not path.exists():
            logger.warning(f"File not found: {filepath}")
            return pairs
        
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        pairs.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        
        logger.info(f"Loaded {len(pairs)} pairs from {filepath}")
        return pairs
    
    def run(self, input_files: list):
        """Lance le pipeline complet de formatage."""
        logger.info("=" * 60)
        logger.info("Dataset Formatter — Starting")
        logger.info(f"Format: {self.format}")
        logger.info(f"Output: {self.output_dir}")
        logger.info("=" * 60)
        
        # 1. Charger tous les fichiers
        all_pairs = []
        for filepath in input_files:
            pairs = self.load_jsonl(filepath)
            all_pairs.extend(pairs)
        self.stats["total_loaded"] = len(all_pairs)
        logger.info(f"Total loaded: {len(all_pairs)} pairs")
        
        # 2. Dédupliquer
        all_pairs = deduplicate(all_pairs)
        self.stats["after_dedup"] = len(all_pairs)
        logger.info(f"After dedup: {len(all_pairs)} pairs")
        
        # 3. Valider
        valid_pairs = []
        for pair in all_pairs:
            is_valid, reason = validate_pair(pair)
            if is_valid:
                valid_pairs.append(pair)
                self.stats["valid"] += 1
                # Stats par source
                source = pair.get("metadata", {}).get("source", "unknown")
                self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1
                ejb_type = pair.get("metadata", {}).get("ejb_type", "unknown")
                self.stats["by_type"][ejb_type] = self.stats["by_type"].get(ejb_type, 0) + 1
            else:
                self.stats["invalid"] += 1
                self.stats["invalid_reasons"][reason] = self.stats["invalid_reasons"].get(reason, 0) + 1
        
        logger.info(f"Valid: {len(valid_pairs)}, Invalid: {self.stats['invalid']}")
        
        # 4. Mélanger
        random.seed(42)
        random.shuffle(valid_pairs)
        
        # 5. Split train/val
        val_size = max(1, int(len(valid_pairs) * self.val_split))
        train_pairs = valid_pairs[val_size:]
        val_pairs = valid_pairs[:val_size]
        self.stats["train_size"] = len(train_pairs)
        self.stats["val_size"] = len(val_pairs)
        
        # 6. Formater et sauvegarder
        self._save_formatted(train_pairs, "train.jsonl")
        self._save_formatted(val_pairs, "val.jsonl")
        
        # 7. Sauvegarder aussi en format brut (pour debug)
        self._save_raw(valid_pairs, "all_pairs_raw.jsonl")
        
        # 8. Stats
        self._save_stats()
        
        logger.info("=" * 60)
        logger.info("Formatting complete!")
        logger.info(f"Train: {self.stats['train_size']} pairs")
        logger.info(f"Val: {self.stats['val_size']} pairs")
        logger.info(f"By source: {json.dumps(self.stats['by_source'], indent=2)}")
        logger.info(f"Invalid reasons: {json.dumps(self.stats['invalid_reasons'], indent=2)}")
        logger.info("=" * 60)
    
    def _save_formatted(self, pairs: list, filename: str):
        filepath = self.output_dir / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            for pair in pairs:
                formatted = self.formatter(pair)
                f.write(json.dumps(formatted, ensure_ascii=False) + '\n')
        logger.info(f"Saved {len(pairs)} formatted pairs to {filepath}")
    
    def _save_raw(self, pairs: list, filename: str):
        filepath = self.output_dir / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            for pair in pairs:
                f.write(json.dumps(pair, ensure_ascii=False) + '\n')
    
    def _save_stats(self):
        stats_file = self.output_dir / "dataset_stats.json"
        stats_file.write_text(json.dumps(self.stats, indent=2), encoding='utf-8')

# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Format and merge datasets for QLoRA")
    parser.add_argument("--bmce", default="./dataset/bmce_pairs/bmce_pairs.jsonl")
    parser.add_argument("--synthetic", default="./dataset/synthetic_pairs/synthetic_pairs.jsonl")
    parser.add_argument("--extra", nargs="*", default=[], help="Additional JSONL files")
    parser.add_argument("--output", default="./dataset/final")
    parser.add_argument("--format", choices=["chatml", "alpaca", "sharegpt"], default="chatml")
    parser.add_argument("--val-split", type=float, default=0.05)
    args = parser.parse_args()
    
    input_files = [args.bmce, args.synthetic] + args.extra
    
    formatter = DatasetFormatter(args.output, fmt=args.format, val_split=args.val_split)
    formatter.run(input_files)
