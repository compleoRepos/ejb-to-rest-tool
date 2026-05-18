#!/usr/bin/env python3
"""
Fine-tuning pipeline for Java EE → Spring Boot code modernization.
Uses Unsloth + LoRA for efficient fine-tuning on consumer/enterprise GPUs.

v2.0 — Production-grade improvements:
  - Qwen2.5-Coder 32B support (optimal for Java legacy)
  - Dynamic max_seq_length based on model size & VRAM
  - Stratified train/validation split (95/5)
  - Early stopping with patience=3
  - Post-training quality metrics (compilation, BLEU, annotations)
  - Optional WandB integration
  - --dry-run mode for dataset validation
  - Intelligent VRAM management & OOM prevention
  - Comprehensive JSON training report

Prerequisites:
  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
  pip install --no-deps trl peft accelerate bitsandbytes transformers datasets
  pip install sacrebleu   # Optional: for BLEU score evaluation
  pip install wandb       # Optional: for experiment tracking

Usage:
  python train.py --model qwen-coder --dataset ./finetuning-dataset.jsonl
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl --epochs 5
  python train.py --dry-run --dataset ./finetuning-dataset.jsonl
  python train.py --export-gguf --output ./outputs

Author: Compleo — EJB Client Modernizer
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import tempfile
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

# ============================================================
# Configuration — Modèles supportés
# ============================================================

SUPPORTED_MODELS = {
    # ── Qwen2.5-Coder — Meilleur modèle actuel pour Java (RÈGLE 2) ──
    "qwen-coder": {
        "hf_id": "unsloth/Qwen2.5-Coder-32B-Instruct-bnb-4bit",
        "size_class": "32B",
        "min_vram_gb": 24,
        "recommended_vram_gb": 40,
        "max_seq_length": 4096,     # Contraint par VRAM sur 48GB
        "batch_size": 1,            # 32B = batch réduit
        "grad_accum": 8,            # Compense le batch réduit
        "description": "Qwen2.5-Coder 32B — Best-in-class for Java code transformation",
    },
    # ── CodeLlama 13B — Bon compromis qualité/vitesse ──
    "codellama": {
        "hf_id": "unsloth/codellama-13b-instruct-bnb-4bit",
        "size_class": "13B",
        "min_vram_gb": 12,
        "recommended_vram_gb": 24,
        "max_seq_length": 6144,     # 13B peut aller plus loin
        "batch_size": 2,
        "grad_accum": 4,
        "description": "CodeLlama 13B — Solid Java performance, moderate VRAM",
    },
    # ── CodeLlama 7B — Rapide, moins de VRAM ──
    "codellama-7b": {
        "hf_id": "unsloth/codellama-7b-instruct-bnb-4bit",
        "size_class": "7B",
        "min_vram_gb": 8,
        "recommended_vram_gb": 16,
        "max_seq_length": 8192,     # 7B = plus de marge VRAM
        "batch_size": 4,
        "grad_accum": 2,
        "description": "CodeLlama 7B — Fast training, lower VRAM requirement",
    },
    # ── Mistral 7B — Bonne alternative généraliste ──
    "mistral": {
        "hf_id": "unsloth/mistral-7b-instruct-v0.3-bnb-4bit",
        "size_class": "7B",
        "min_vram_gb": 8,
        "recommended_vram_gb": 16,
        "max_seq_length": 8192,
        "batch_size": 4,
        "grad_accum": 2,
        "description": "Mistral 7B — Good generalist, fast training",
    },
    # ── LLaMA 3 8B — Meta's latest ──
    "llama3": {
        "hf_id": "unsloth/llama-3-8b-instruct-bnb-4bit",
        "size_class": "8B",
        "min_vram_gb": 8,
        "recommended_vram_gb": 16,
        "max_seq_length": 8192,
        "batch_size": 4,
        "grad_accum": 2,
        "description": "LLaMA 3 8B — Meta's latest, good code understanding",
    },
    # ── DeepSeek Coder 6.7B — Spécialisé code ──
    "deepseek": {
        "hf_id": "unsloth/deepseek-coder-6.7b-instruct-bnb-4bit",
        "size_class": "7B",
        "min_vram_gb": 8,
        "recommended_vram_gb": 16,
        "max_seq_length": 8192,
        "batch_size": 4,
        "grad_accum": 2,
        "description": "DeepSeek Coder 6.7B — Code-specialized, efficient",
    },
}

# ============================================================
# Configuration — LoRA
# ============================================================

LORA_CONFIG = {
    "r": 16,                    # LoRA rank
    "lora_alpha": 32,           # LoRA scaling factor (alpha/r = 2)
    "lora_dropout": 0.05,       # Dropout for regularization
    "target_modules": [         # All attention + MLP layers
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    "bias": "none",
    "use_gradient_checkpointing": "unsloth",
}

# ============================================================
# Configuration — Training defaults
# ============================================================

TRAINING_DEFAULTS = {
    "warmup_steps": 10,
    "learning_rate": 2e-4,
    "fp16": True,
    "logging_steps": 10,
    "optim": "adamw_8bit",
    "weight_decay": 0.01,
    "lr_scheduler_type": "cosine",
    "seed": 42,
    "save_strategy": "steps",
    "save_steps": 100,
    "save_total_limit": 3,
    # ── RÈGLE 5: Early stopping via evaluation ──
    "eval_strategy": "steps",
    "eval_steps": 100,
    "load_best_model_at_end": True,
    "metric_for_best_model": "eval_loss",
    "greater_is_better": False,
}

# ============================================================
# Spring Boot annotation patterns (for quality metrics)
# ============================================================

SPRING_ANNOTATIONS = [
    "@RestController", "@Service", "@Repository", "@Component",
    "@Autowired", "@GetMapping", "@PostMapping", "@PutMapping",
    "@DeleteMapping", "@RequestMapping", "@Entity", "@Table",
    "@Transactional", "@Configuration", "@Bean", "@Value",
    "@SpringBootApplication", "@EnableJpaRepositories",
]


# ============================================================
# VRAM Management (RÈGLE 9)
# ============================================================

def get_gpu_info() -> dict:
    """Detect GPU and return VRAM info."""
    info = {"available": False, "name": "N/A", "vram_total_gb": 0, "vram_free_gb": 0}
    try:
        import torch
        if torch.cuda.is_available():
            info["available"] = True
            info["name"] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            info["vram_total_gb"] = round(props.total_mem / 1e9, 1)
            # Free VRAM
            free, total = torch.cuda.mem_get_info(0)
            info["vram_free_gb"] = round(free / 1e9, 1)
    except Exception:
        pass
    return info


def check_vram_compatibility(model_key: str, gpu_info: dict) -> dict:
    """
    Check if the selected model fits in available VRAM.
    Returns a recommendation dict with warnings if needed.
    (RÈGLE 9: Gestion mémoire intelligente)
    """
    model_cfg = SUPPORTED_MODELS[model_key]
    result = {
        "compatible": True,
        "warnings": [],
        "recommended_model": model_key,
        "estimated_vram_gb": 0,
    }

    if not gpu_info["available"]:
        result["compatible"] = False
        result["warnings"].append("No GPU detected. Training will be extremely slow on CPU.")
        return result

    vram = gpu_info["vram_total_gb"]
    min_vram = model_cfg["min_vram_gb"]
    rec_vram = model_cfg["recommended_vram_gb"]

    # Estimate VRAM usage: model weights + optimizer states + activations
    size_map = {"7B": 5, "8B": 6, "13B": 9, "32B": 22}
    base_vram = size_map.get(model_cfg["size_class"], 10)
    # LoRA adds ~10-15% overhead, optimizer states ~30%, activations ~20%
    estimated = base_vram * 1.65
    result["estimated_vram_gb"] = round(estimated, 1)

    if vram < min_vram:
        result["compatible"] = False
        result["warnings"].append(
            f"VRAM insuffisante: {vram:.1f} GB disponible, {min_vram} GB minimum requis pour {model_cfg['size_class']}."
        )
        # Recommend a smaller model
        for alt_key in ["codellama-7b", "mistral", "deepseek", "llama3"]:
            if SUPPORTED_MODELS[alt_key]["min_vram_gb"] <= vram:
                result["recommended_model"] = alt_key
                result["warnings"].append(f"Recommandation: utiliser --model {alt_key} à la place.")
                break
    elif vram < rec_vram:
        result["warnings"].append(
            f"VRAM limitée: {vram:.1f} GB (recommandé: {rec_vram} GB). "
            f"Le training fonctionnera mais sera plus lent. Risque d'OOM avec de longues séquences."
        )

    return result


def get_dynamic_seq_length(model_key: str, gpu_info: dict) -> int:
    """
    Calculate optimal max_seq_length based on model size and available VRAM.
    (RÈGLE 3: max_seq_length dynamique)
    """
    model_cfg = SUPPORTED_MODELS[model_key]
    base_length = model_cfg["max_seq_length"]

    if not gpu_info["available"]:
        return min(base_length, 2048)  # CPU fallback

    vram = gpu_info["vram_total_gb"]

    # On L40S 48GB, we can push the limits
    if vram >= 45:
        # Generous VRAM — push seq length up
        bonus = {"7B": 2048, "8B": 2048, "13B": 1024, "32B": 0}
        return base_length + bonus.get(model_cfg["size_class"], 0)
    elif vram >= 24:
        return base_length
    else:
        # Tight VRAM — reduce seq length
        reduction = {"7B": 0, "8B": 0, "13B": 1024, "32B": 2048}
        return max(2048, base_length - reduction.get(model_cfg["size_class"], 0))


# ============================================================
# Dataset Loading & Validation
# ============================================================

def load_dataset(dataset_path: str) -> list:
    """Load and validate the JSONL dataset."""
    entries = []
    errors = 0
    with open(dataset_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                if "messages" not in entry:
                    errors += 1
                    continue
                messages = entry["messages"]
                if len(messages) < 3:
                    errors += 1
                    continue
                entries.append(entry)
            except json.JSONDecodeError:
                errors += 1
    if errors > 0:
        print(f"  ⚠ {errors} lignes ignorées (format invalide)")
    return entries


def get_category(entry: dict) -> str:
    """Extract category from entry metadata."""
    meta = entry.get("metadata", {})
    return meta.get("category", "unknown")


def stratified_split(entries: list, val_ratio: float = 0.05, seed: int = 42):
    """
    Split dataset into train/validation with stratification by category.
    Ensures each category is proportionally represented in both splits.
    (RÈGLE 4: Validation split stratifié)
    """
    import random
    rng = random.Random(seed)

    # Group by category
    by_category = defaultdict(list)
    for entry in entries:
        cat = get_category(entry)
        by_category[cat].append(entry)

    train_entries = []
    val_entries = []

    for cat, cat_entries in by_category.items():
        rng.shuffle(cat_entries)
        n_val = max(1, int(len(cat_entries) * val_ratio))
        val_entries.extend(cat_entries[:n_val])
        train_entries.extend(cat_entries[n_val:])

    # Final shuffle
    rng.shuffle(train_entries)
    rng.shuffle(val_entries)

    return train_entries, val_entries


def format_for_training(entries: list, tokenizer) -> list:
    """Convert JSONL entries to the chat template format expected by the model."""
    formatted = []
    for entry in entries:
        messages = entry["messages"]
        try:
            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            formatted.append({"text": text})
        except Exception:
            # Fallback: manual formatting
            text = ""
            for msg in messages:
                role = msg["role"]
                content = msg["content"]
                if role == "system":
                    text += f"[INST] <<SYS>>\n{content}\n<</SYS>>\n\n"
                elif role == "user":
                    text += f"{content} [/INST]\n"
                elif role == "assistant":
                    text += f"{content}\n"
            formatted.append({"text": text})
    return formatted


def print_dataset_stats(entries: list, val_entries: list = None):
    """Print dataset statistics with optional validation split info."""
    categories = Counter()
    methods = Counter()
    token_lengths = []

    for entry in entries:
        meta = entry.get("metadata", {})
        categories[meta.get("category", "unknown")] += 1
        methods[meta.get("method", "unknown")] += 1
        # Estimate token count from assistant message
        for msg in entry.get("messages", []):
            if msg["role"] == "assistant":
                token_lengths.append(len(msg["content"]) // 4)  # ~4 chars/token

    print("\n╔══════════════════════════════════════════════════════╗")
    print("║           Dataset Statistics                         ║")
    print("╠══════════════════════════════════════════════════════╣")
    total = len(entries) + (len(val_entries) if val_entries else 0)
    print(f"║  Total entries     : {total:>7}                        ║")
    if val_entries:
        print(f"║  Training entries  : {len(entries):>7} (95%)                   ║")
        print(f"║  Validation entries: {len(val_entries):>7} (5%)                    ║")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  By category:                                        ║")
    for cat, count in categories.most_common():
        pct = 100 * count / len(entries) if entries else 0
        bar = "█" * min(int(pct), 25)
        print(f"║    {cat:<25} {count:>5} ({pct:4.1f}%) {bar}")
    print("╠══════════════════════════════════════════════════════╣")
    print("║  By method:                                           ║")
    for method, count in methods.most_common():
        print(f"║    {method:<25} {count:>5}                     ║")
    if token_lengths:
        avg_tokens = sum(token_lengths) // len(token_lengths)
        max_tokens = max(token_lengths)
        p95_tokens = sorted(token_lengths)[int(len(token_lengths) * 0.95)]
        print("╠══════════════════════════════════════════════════════╣")
        print(f"║  Token stats (estimated):                            ║")
        print(f"║    Average : {avg_tokens:>6} tokens                        ║")
        print(f"║    P95     : {p95_tokens:>6} tokens                        ║")
        print(f"║    Max     : {max_tokens:>6} tokens                        ║")
    print("╚══════════════════════════════════════════════════════╝")


def preview_examples(entries: list, n: int = 3):
    """Print a preview of N examples from the dataset."""
    import random
    samples = random.sample(entries, min(n, len(entries)))
    for i, entry in enumerate(samples, 1):
        meta = entry.get("metadata", {})
        cat = meta.get("category", "unknown")
        method = meta.get("method", "unknown")
        messages = entry["messages"]
        user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        assistant_msg = next((m["content"] for m in messages if m["role"] == "assistant"), "")
        print(f"\n{'─' * 60}")
        print(f"  Example {i}/{n} — [{cat}] ({method})")
        print(f"{'─' * 60}")
        print(f"  INPUT  (first 200 chars):")
        print(f"    {user_msg[:200]}...")
        print(f"  OUTPUT (first 200 chars):")
        print(f"    {assistant_msg[:200]}...")


# ============================================================
# WandB Integration (RÈGLE 7)
# ============================================================

def setup_wandb(args, model_cfg: dict, dataset_size: int) -> bool:
    """
    Initialize WandB if available. Returns True if active.
    (RÈGLE 7: WandB optionnel — ne crash pas si absent)
    """
    try:
        import wandb
        wandb.init(
            project="ejb-modernizer-finetuning",
            name=f"{args.model}-{model_cfg['size_class']}-{dataset_size}",
            config={
                "model": args.model,
                "hf_id": model_cfg["hf_id"],
                "size_class": model_cfg["size_class"],
                "dataset_size": dataset_size,
                "epochs": args.epochs,
                "lora_rank": LORA_CONFIG["r"],
                "lora_alpha": LORA_CONFIG["lora_alpha"],
                "learning_rate": TRAINING_DEFAULTS["learning_rate"],
                "max_seq_length": model_cfg["max_seq_length"],
            },
            tags=["java-legacy", "spring-boot", "code-modernization", model_cfg["size_class"]],
        )
        print("  ✓ WandB initialized — tracking enabled")
        return True
    except ImportError:
        print("  ℹ WandB not installed — training will proceed without experiment tracking")
        print("    Install with: pip install wandb")
        return False
    except Exception as e:
        print(f"  ⚠ WandB init failed: {e} — continuing without tracking")
        return False


# ============================================================
# Quality Metrics (RÈGLE 6)
# ============================================================

def evaluate_quality(model, tokenizer, val_entries: list, max_samples: int = 100) -> dict:
    """
    Evaluate model quality on validation examples.
    Measures: compilation rate, Spring annotations, BLEU score, token overlap.
    (RÈGLE 6: Métriques de qualité post-training)
    """
    import random
    from unsloth import FastLanguageModel

    samples = random.sample(val_entries, min(max_samples, len(val_entries)))
    results = {
        "total_samples": len(samples),
        "compilation_attempts": 0,
        "compilation_successes": 0,
        "compilation_rate": 0.0,
        "spring_annotation_rate": 0.0,
        "avg_bleu_score": 0.0,
        "avg_token_overlap": 0.0,
        "per_category": {},
    }

    bleu_scores = []
    overlap_scores = []
    annotation_counts = []
    category_results = defaultdict(lambda: {"total": 0, "compiled": 0, "bleu_sum": 0.0})

    # Enable inference mode
    FastLanguageModel.for_inference(model)

    print(f"\n  Evaluating on {len(samples)} samples...")

    for i, entry in enumerate(samples):
        if (i + 1) % 20 == 0:
            print(f"    Progress: {i + 1}/{len(samples)}")

        messages = entry["messages"]
        category = get_category(entry)
        reference = next((m["content"] for m in messages if m["role"] == "assistant"), "")
        user_input = next((m["content"] for m in messages if m["role"] == "user"), "")
        system_prompt = next((m["content"] for m in messages if m["role"] == "system"), "")

        # Generate prediction
        prompt_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ]
        try:
            input_text = tokenizer.apply_chat_template(
                prompt_messages, tokenize=False, add_generation_prompt=True
            )
        except Exception:
            input_text = f"[INST] <<SYS>>\n{system_prompt}\n<</SYS>>\n\n{user_input} [/INST]\n"

        try:
            inputs = tokenizer(input_text, return_tensors="pt", truncation=True, max_length=4096)
            inputs = {k: v.to(model.device) for k, v in inputs.items()}

            import torch
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    temperature=0.1,
                    do_sample=False,
                )
            prediction = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        except Exception:
            prediction = ""

        cat_res = category_results[category]
        cat_res["total"] += 1

        # ── Metric 1: Compilation check (via javac) ──
        if prediction.strip() and "class " in prediction:
            compiled = check_compilation(prediction)
            results["compilation_attempts"] += 1
            if compiled:
                results["compilation_successes"] += 1
                cat_res["compiled"] += 1

        # ── Metric 2: Spring annotations presence ──
        found_annotations = sum(1 for ann in SPRING_ANNOTATIONS if ann in prediction)
        expected_annotations = sum(1 for ann in SPRING_ANNOTATIONS if ann in reference)
        if expected_annotations > 0:
            annotation_counts.append(found_annotations / expected_annotations)
        elif found_annotations > 0:
            annotation_counts.append(1.0)

        # ── Metric 3: BLEU score ──
        bleu = compute_bleu(reference, prediction)
        bleu_scores.append(bleu)
        cat_res["bleu_sum"] += bleu

        # ── Metric 4: Token overlap ──
        overlap = compute_token_overlap(reference, prediction)
        overlap_scores.append(overlap)

    # Aggregate results
    if results["compilation_attempts"] > 0:
        results["compilation_rate"] = round(
            results["compilation_successes"] / results["compilation_attempts"] * 100, 1
        )
    if annotation_counts:
        results["spring_annotation_rate"] = round(sum(annotation_counts) / len(annotation_counts) * 100, 1)
    if bleu_scores:
        results["avg_bleu_score"] = round(sum(bleu_scores) / len(bleu_scores), 2)
    if overlap_scores:
        results["avg_token_overlap"] = round(sum(overlap_scores) / len(overlap_scores) * 100, 1)

    # Per-category breakdown
    for cat, data in category_results.items():
        results["per_category"][cat] = {
            "samples": data["total"],
            "compilation_rate": round(data["compiled"] / data["total"] * 100, 1) if data["total"] > 0 else 0,
            "avg_bleu": round(data["bleu_sum"] / data["total"], 2) if data["total"] > 0 else 0,
        }

    # Re-enable training mode
    FastLanguageModel.for_training(model)

    return results


def check_compilation(java_code: str) -> bool:
    """
    Attempt to compile Java code using javac.
    Returns True if compilation succeeds.
    """
    # Extract class name from code
    match = re.search(r"(?:public\s+)?class\s+(\w+)", java_code)
    if not match:
        return False
    class_name = match.group(1)

    tmpdir = tempfile.mkdtemp(prefix="javac_check_")
    try:
        filepath = os.path.join(tmpdir, f"{class_name}.java")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(java_code)

        result = subprocess.run(
            ["javac", "-nowarn", filepath],
            capture_output=True,
            timeout=10,
            cwd=tmpdir,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        # javac not available or timeout — skip
        return False
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def compute_bleu(reference: str, prediction: str) -> float:
    """Compute BLEU score between reference and prediction."""
    try:
        import sacrebleu
        score = sacrebleu.sentence_bleu(prediction, [reference])
        return score.score / 100.0  # Normalize to 0-1
    except ImportError:
        # Fallback: simple n-gram overlap
        ref_tokens = reference.split()
        pred_tokens = prediction.split()
        if not pred_tokens or not ref_tokens:
            return 0.0
        # Unigram precision
        ref_set = set(ref_tokens)
        matches = sum(1 for t in pred_tokens if t in ref_set)
        precision = matches / len(pred_tokens) if pred_tokens else 0
        # Brevity penalty
        bp = min(1.0, len(pred_tokens) / len(ref_tokens)) if ref_tokens else 0
        return round(precision * bp, 4)


def compute_token_overlap(reference: str, prediction: str) -> float:
    """Compute token-level overlap (Jaccard similarity) between reference and prediction."""
    ref_tokens = set(reference.split())
    pred_tokens = set(prediction.split())
    if not ref_tokens and not pred_tokens:
        return 1.0
    if not ref_tokens or not pred_tokens:
        return 0.0
    intersection = ref_tokens & pred_tokens
    union = ref_tokens | pred_tokens
    return len(intersection) / len(union)


# ============================================================
# Training Report (RÈGLE 10)
# ============================================================

def generate_report(
    args,
    model_cfg: dict,
    gpu_info: dict,
    seq_length: int,
    train_size: int,
    val_size: int,
    trainer_stats,
    eval_results: Optional[dict],
    training_duration: float,
    vram_peak: float,
) -> dict:
    """
    Generate a comprehensive JSON training report.
    (RÈGLE 10: Rapport final lisible)
    """
    report = {
        "version": "2.0",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        # ── Model info ──
        "model": {
            "alias": args.model,
            "hf_id": model_cfg["hf_id"],
            "size_class": model_cfg["size_class"],
            "max_seq_length": seq_length,
        },
        # ── Dataset info ──
        "dataset": {
            "path": args.dataset,
            "train_size": train_size,
            "val_size": val_size,
            "total_size": train_size + val_size,
        },
        # ── Training config ──
        "training": {
            "epochs": args.epochs,
            "batch_size": model_cfg["batch_size"],
            "gradient_accumulation": model_cfg["grad_accum"],
            "effective_batch_size": model_cfg["batch_size"] * model_cfg["grad_accum"],
            "learning_rate": TRAINING_DEFAULTS["learning_rate"],
            "lora_rank": LORA_CONFIG["r"],
            "lora_alpha": LORA_CONFIG["lora_alpha"],
            "optimizer": TRAINING_DEFAULTS["optim"],
            "scheduler": TRAINING_DEFAULTS["lr_scheduler_type"],
            "early_stopping_patience": 3,
        },
        # ── Results ──
        "results": {
            "training_loss": round(trainer_stats.training_loss, 4) if trainer_stats else None,
            "eval_loss": None,
            "training_duration_seconds": round(training_duration, 0),
            "training_duration_human": format_duration(training_duration),
            "vram_peak_gb": round(vram_peak, 1),
        },
        # ── GPU info ──
        "gpu": {
            "name": gpu_info.get("name", "N/A"),
            "vram_total_gb": gpu_info.get("vram_total_gb", 0),
        },
        # ── Quality metrics ──
        "quality_metrics": eval_results if eval_results else None,
        # ── Recommendations ──
        "recommendations": [],
    }

    # Extract eval loss from trainer if available
    if trainer_stats and hasattr(trainer_stats, "metrics"):
        eval_loss = trainer_stats.metrics.get("eval_loss")
        if eval_loss:
            report["results"]["eval_loss"] = round(eval_loss, 4)

    # Generate recommendations for next run
    recs = report["recommendations"]
    if eval_results:
        if eval_results.get("compilation_rate", 0) < 50:
            recs.append("Compilation rate is low. Consider adding more expert examples or increasing epochs.")
        if eval_results.get("avg_bleu_score", 0) < 0.3:
            recs.append("BLEU score is low. The model may need more training data or a larger base model.")
        if eval_results.get("spring_annotation_rate", 0) < 70:
            recs.append("Spring annotation coverage is low. Add more examples with diverse annotations.")
    if vram_peak > 0 and gpu_info.get("vram_total_gb", 0) > 0:
        usage_pct = vram_peak / gpu_info["vram_total_gb"] * 100
        if usage_pct > 90:
            recs.append(f"VRAM usage is high ({usage_pct:.0f}%). Consider reducing batch_size or max_seq_length.")
        elif usage_pct < 60:
            recs.append(f"VRAM usage is low ({usage_pct:.0f}%). You could increase batch_size or max_seq_length for faster training.")
    if not recs:
        recs.append("Training completed successfully. Consider running evaluation on a held-out test set.")

    return report


def format_duration(seconds: float) -> str:
    """Format seconds into human-readable duration."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours}h {minutes}m {secs}s"
    elif minutes > 0:
        return f"{minutes}m {secs}s"
    else:
        return f"{secs}s"


def print_report(report: dict):
    """Print training report to console."""
    print("\n" + "═" * 60)
    print("  TRAINING REPORT")
    print("═" * 60)
    print(f"  Model       : {report['model']['alias']} ({report['model']['size_class']})")
    print(f"  Dataset     : {report['dataset']['train_size']} train / {report['dataset']['val_size']} val")
    print(f"  Seq length  : {report['model']['max_seq_length']}")
    print(f"  Duration    : {report['results']['training_duration_human']}")
    print(f"  VRAM peak   : {report['results']['vram_peak_gb']} GB")
    print(f"  Train loss  : {report['results']['training_loss']}")
    print(f"  Eval loss   : {report['results']['eval_loss']}")

    qm = report.get("quality_metrics")
    if qm:
        print(f"\n  Quality Metrics:")
        print(f"    Compilation rate     : {qm.get('compilation_rate', 'N/A')}%")
        print(f"    Spring annotations   : {qm.get('spring_annotation_rate', 'N/A')}%")
        print(f"    BLEU score           : {qm.get('avg_bleu_score', 'N/A')}")
        print(f"    Token overlap        : {qm.get('avg_token_overlap', 'N/A')}%")

        per_cat = qm.get("per_category", {})
        if per_cat:
            print(f"\n    Per-category breakdown:")
            for cat, data in sorted(per_cat.items()):
                print(f"      {cat:<25} BLEU={data['avg_bleu']:.2f}  Compile={data['compilation_rate']}%")

    recs = report.get("recommendations", [])
    if recs:
        print(f"\n  Recommendations:")
        for rec in recs:
            print(f"    → {rec}")

    print("═" * 60)


# ============================================================
# Dry Run Mode (RÈGLE 8)
# ============================================================

def dry_run(args):
    """
    Validate dataset without launching training.
    Shows stats and previews 3 examples.
    (RÈGLE 8: Mode --dry-run)
    """
    print("=" * 60)
    print("  EJB Client Modernizer — DRY RUN MODE")
    print("  Validating dataset without training")
    print("=" * 60)

    # Load dataset
    print(f"\n[1/4] Loading dataset from {args.dataset}...")
    entries = load_dataset(args.dataset)
    if not entries:
        print("ERROR: No valid entries found!")
        sys.exit(1)

    # Split
    print(f"\n[2/4] Stratified split (95/5)...")
    train_entries, val_entries = stratified_split(entries)
    print_dataset_stats(train_entries, val_entries)

    # Preview
    print(f"\n[3/4] Preview of 3 random examples:")
    preview_examples(entries, n=3)

    # GPU check
    print(f"\n[4/4] GPU & VRAM check:")
    gpu_info = get_gpu_info()
    if gpu_info["available"]:
        print(f"  GPU: {gpu_info['name']}")
        print(f"  VRAM: {gpu_info['vram_total_gb']} GB total, {gpu_info['vram_free_gb']} GB free")
    else:
        print("  No GPU detected")

    model_key = args.model
    model_cfg = SUPPORTED_MODELS[model_key]
    compat = check_vram_compatibility(model_key, gpu_info)
    seq_length = get_dynamic_seq_length(model_key, gpu_info)

    print(f"\n  Selected model: {model_key} ({model_cfg['size_class']})")
    print(f"  HuggingFace ID: {model_cfg['hf_id']}")
    print(f"  Dynamic seq length: {seq_length}")
    print(f"  Batch size: {model_cfg['batch_size']}")
    print(f"  Gradient accumulation: {model_cfg['grad_accum']}")
    print(f"  Effective batch: {model_cfg['batch_size'] * model_cfg['grad_accum']}")
    print(f"  Estimated VRAM: {compat['estimated_vram_gb']} GB")

    if compat["warnings"]:
        for w in compat["warnings"]:
            print(f"  ⚠ {w}")

    if not compat["compatible"]:
        print(f"\n  ✗ Model NOT compatible with current GPU")
        print(f"  → Recommended: --model {compat['recommended_model']}")
    else:
        print(f"\n  ✓ Model compatible — ready for training")

    # Estimate training time
    steps_per_epoch = len(train_entries) // (model_cfg["batch_size"] * model_cfg["grad_accum"])
    total_steps = steps_per_epoch * args.epochs
    # Rough estimate: ~1-3 seconds per step depending on model size
    sec_per_step = {"7B": 1.0, "8B": 1.2, "13B": 2.0, "32B": 4.5}
    est_time = total_steps * sec_per_step.get(model_cfg["size_class"], 2.0)
    print(f"\n  Estimated training time: {format_duration(est_time)}")
    print(f"  Steps per epoch: {steps_per_epoch}")
    print(f"  Total steps: {total_steps}")

    print("\n" + "=" * 60)
    print("  Dry run complete. Use without --dry-run to start training.")
    print("=" * 60)


# ============================================================
# Main Training Function
# ============================================================

def train(args):
    """Main training function with all v2.0 improvements."""
    start_time = time.time()

    print("=" * 60)
    print("  EJB Client Modernizer — Fine-tuning Pipeline v2.0")
    print("  Java EE → Spring Boot Code Transformation")
    print("=" * 60)

    # ── Step 1: Load dataset ──
    print(f"\n[1/8] Loading dataset from {args.dataset}...")
    all_entries = load_dataset(args.dataset)
    if not all_entries:
        print("ERROR: No valid entries found in dataset!")
        sys.exit(1)

    # ── Step 2: Stratified split (RÈGLE 4) ──
    print(f"\n[2/8] Stratified train/validation split (95/5)...")
    train_entries, val_entries = stratified_split(all_entries, val_ratio=0.05)
    print_dataset_stats(train_entries, val_entries)

    # ── Step 3: GPU check & VRAM management (RÈGLE 9) ──
    print(f"\n[3/8] Checking GPU & VRAM...")
    gpu_info = get_gpu_info()
    if gpu_info["available"]:
        print(f"  GPU: {gpu_info['name']}")
        print(f"  VRAM: {gpu_info['vram_total_gb']} GB total, {gpu_info['vram_free_gb']} GB free")
    else:
        print("  ⚠ No GPU detected — training will be very slow")

    model_key = args.model
    model_cfg = SUPPORTED_MODELS[model_key]

    compat = check_vram_compatibility(model_key, gpu_info)
    if not compat["compatible"]:
        for w in compat["warnings"]:
            print(f"  ✗ {w}")
        if compat["recommended_model"] != model_key:
            print(f"\n  Switching to recommended model: {compat['recommended_model']}")
            model_key = compat["recommended_model"]
            model_cfg = SUPPORTED_MODELS[model_key]
    elif compat["warnings"]:
        for w in compat["warnings"]:
            print(f"  ⚠ {w}")

    # Dynamic seq length (RÈGLE 3)
    seq_length = get_dynamic_seq_length(model_key, gpu_info)
    print(f"  Dynamic max_seq_length: {seq_length} (based on {model_cfg['size_class']} + {gpu_info['vram_total_gb']} GB VRAM)")

    # ── Step 4: Load model ──
    model_id = model_cfg["hf_id"]
    print(f"\n[4/8] Loading model: {model_id}")
    print(f"  Size class: {model_cfg['size_class']}")
    print(f"  Description: {model_cfg['description']}")

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("\nERROR: Unsloth not installed. Install with:")
        print('  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"')
        print('  pip install --no-deps trl peft accelerate bitsandbytes transformers datasets')
        sys.exit(1)

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_id,
        max_seq_length=seq_length,
        dtype=None,             # Auto-detect (float16 for V100, bfloat16 for A100/L40S)
        load_in_4bit=True,
    )

    # ── Step 5: Apply LoRA ──
    print(f"\n[5/8] Applying LoRA adapters (rank={LORA_CONFIG['r']})...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_CONFIG["r"],
        lora_alpha=LORA_CONFIG["lora_alpha"],
        lora_dropout=LORA_CONFIG["lora_dropout"],
        target_modules=LORA_CONFIG["target_modules"],
        bias=LORA_CONFIG["bias"],
        use_gradient_checkpointing=LORA_CONFIG["use_gradient_checkpointing"],
        random_state=42,
    )

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Trainable parameters: {trainable:,} / {total_params:,} ({100 * trainable / total_params:.2f}%)")

    # ── Step 6: Prepare datasets ──
    print(f"\n[6/8] Formatting datasets for training...")
    formatted_train = format_for_training(train_entries, tokenizer)
    formatted_val = format_for_training(val_entries, tokenizer)

    from datasets import Dataset
    train_dataset = Dataset.from_list(formatted_train)
    val_dataset = Dataset.from_list(formatted_val)
    print(f"  Training examples : {len(train_dataset)}")
    print(f"  Validation examples: {len(val_dataset)}")

    # ── Step 7: WandB setup (RÈGLE 7) ──
    wandb_active = setup_wandb(args, model_cfg, len(all_entries))

    # ── Step 8: Train with early stopping (RÈGLE 5) ──
    print(f"\n[7/8] Starting training...")
    print(f"  Model          : {model_key} ({model_cfg['size_class']})")
    print(f"  Epochs         : {args.epochs}")
    print(f"  Batch size     : {model_cfg['batch_size']}")
    print(f"  Grad accum     : {model_cfg['grad_accum']}")
    print(f"  Effective batch: {model_cfg['batch_size'] * model_cfg['grad_accum']}")
    print(f"  Learning rate  : {TRAINING_DEFAULTS['learning_rate']}")
    print(f"  Seq length     : {seq_length}")
    print(f"  Early stopping : patience=3, eval every 100 steps")

    from trl import SFTTrainer
    from transformers import TrainingArguments, EarlyStoppingCallback

    training_args_dict = {
        **TRAINING_DEFAULTS,
        "num_train_epochs": args.epochs,
        "output_dir": args.output,
        "per_device_train_batch_size": model_cfg["batch_size"],
        "gradient_accumulation_steps": model_cfg["grad_accum"],
        "per_device_eval_batch_size": model_cfg["batch_size"],
    }

    # WandB reporting
    if wandb_active:
        training_args_dict["report_to"] = "wandb"
    else:
        training_args_dict["report_to"] = "none"

    training_args = TrainingArguments(**training_args_dict)

    # Early stopping callback (RÈGLE 5)
    early_stopping = EarlyStoppingCallback(
        early_stopping_patience=3,
        early_stopping_threshold=0.001,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        dataset_text_field="text",
        max_seq_length=seq_length,
        dataset_num_proc=2,
        packing=True,
        args=training_args,
        callbacks=[early_stopping],
    )

    # Track VRAM peak
    vram_peak = 0.0
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:
        pass

    trainer_stats = trainer.train()

    # Get VRAM peak
    try:
        import torch
        if torch.cuda.is_available():
            vram_peak = torch.cuda.max_memory_allocated() / 1e9
    except Exception:
        pass

    training_duration = time.time() - start_time

    print(f"\n  Training complete!")
    print(f"  Training loss : {trainer_stats.training_loss:.4f}")
    print(f"  Duration      : {format_duration(training_duration)}")
    print(f"  VRAM peak     : {vram_peak:.1f} GB")

    # ── Step 8: Quality evaluation (RÈGLE 6) ──
    eval_results = None
    if not args.skip_eval:
        print(f"\n[8/8] Evaluating model quality...")
        try:
            eval_results = evaluate_quality(model, tokenizer, val_entries, max_samples=100)
            print(f"  Compilation rate     : {eval_results['compilation_rate']}%")
            print(f"  Spring annotations   : {eval_results['spring_annotation_rate']}%")
            print(f"  BLEU score           : {eval_results['avg_bleu_score']}")
            print(f"  Token overlap        : {eval_results['avg_token_overlap']}%")
        except Exception as e:
            print(f"  ⚠ Evaluation failed: {e}")
    else:
        print(f"\n[8/8] Skipping evaluation (--skip-eval)")

    # ── Save model ──
    print(f"\n  Saving model to {args.output}...")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    # ── Generate report (RÈGLE 10) ──
    report = generate_report(
        args=args,
        model_cfg=model_cfg,
        gpu_info=gpu_info,
        seq_length=seq_length,
        train_size=len(train_entries),
        val_size=len(val_entries),
        trainer_stats=trainer_stats,
        eval_results=eval_results,
        training_duration=training_duration,
        vram_peak=vram_peak,
    )

    # Save report JSON
    report_path = os.path.join(args.output, "training_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Also save legacy metadata for backward compatibility
    metadata = {
        "base_model": model_id,
        "model_alias": model_key,
        "dataset": args.dataset,
        "dataset_entries": len(all_entries),
        "epochs": args.epochs,
        "lora_config": LORA_CONFIG,
        "training_loss": trainer_stats.training_loss,
        "training_time_seconds": training_duration,
        "max_seq_length": seq_length,
    }
    with open(os.path.join(args.output, "training_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print_report(report)

    # Close WandB
    if wandb_active:
        try:
            import wandb
            wandb.finish()
        except Exception:
            pass

    print(f"\n  Model saved to: {args.output}")
    print(f"  Report saved to: {report_path}")
    print(f"  To convert to GGUF for Ollama:")
    print(f"    python train.py --export-gguf --output {args.output}")


# ============================================================
# GGUF Export (inchangé, compatible v1.0)
# ============================================================

def export_gguf(args):
    """Export the fine-tuned model to GGUF format for Ollama."""
    print("=" * 60)
    print("  Exporting to GGUF format for Ollama")
    print("=" * 60)

    output_dir = args.output
    gguf_dir = output_dir + "-gguf"

    print(f"\n[1/3] Loading fine-tuned model from {output_dir}...")

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("ERROR: Unsloth not installed.")
        sys.exit(1)

    # Load training metadata to get the correct seq_length
    metadata_path = os.path.join(output_dir, "training_metadata.json")
    seq_length = 4096  # default fallback
    if os.path.exists(metadata_path):
        with open(metadata_path) as f:
            metadata = json.load(f)
        base_model = metadata.get("base_model", SUPPORTED_MODELS["codellama"]["hf_id"])
        seq_length = metadata.get("max_seq_length", 4096)
        print(f"  Base model: {base_model}")
        print(f"  Seq length: {seq_length}")
    else:
        print("  ⚠ No training_metadata.json found, using defaults")
        base_model = SUPPORTED_MODELS.get(args.model, SUPPORTED_MODELS["codellama"])["hf_id"]

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=output_dir,
        max_seq_length=seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    print(f"\n[2/3] Converting to GGUF (Q4_K_M quantization)...")
    os.makedirs(gguf_dir, exist_ok=True)

    model.save_pretrained_gguf(
        gguf_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )

    print(f"\n[3/3] GGUF model saved to: {gguf_dir}")

    gguf_files = list(Path(gguf_dir).glob("*.gguf"))
    if gguf_files:
        gguf_file = gguf_files[0]
        size_mb = gguf_file.stat().st_size / (1024 * 1024)
        print(f"  GGUF file: {gguf_file.name} ({size_mb:.0f} MB)")
        print(f"\n  To create an Ollama model:")
        print(f"    1. Copy the GGUF file and Modelfile to the same directory")
        print(f"    2. Run: ollama create ejb-modernizer -f Modelfile")
        print(f"    3. Test: ollama run ejb-modernizer")
    else:
        print("  ⚠ No GGUF file found in output directory")

    print("\n" + "=" * 60)


# ============================================================
# CLI (compatible v1.0 + nouvelles options)
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune a LLM for Java EE → Spring Boot code modernization (v2.0)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate dataset without training (dry run)
  python train.py --dry-run --dataset ./finetuning-dataset.jsonl

  # Train with Qwen2.5-Coder 32B (recommended for L40S 48GB)
  python train.py --model qwen-coder --dataset ./finetuning-dataset.jsonl

  # Train with CodeLlama 13B
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl --epochs 5

  # Train without post-training evaluation (faster)
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl --skip-eval

  # Export to GGUF for Ollama
  python train.py --export-gguf --output ./outputs

  # Full pipeline
  python train.py --model qwen-coder --dataset ./finetuning-dataset.jsonl
  python train.py --export-gguf --output ./outputs
  ollama create ejb-modernizer -f Modelfile
        """,
    )

    parser.add_argument(
        "--model", type=str, default="codellama",
        choices=list(SUPPORTED_MODELS.keys()),
        help="Base model to fine-tune (default: codellama)",
    )
    parser.add_argument(
        "--dataset", type=str, default="./finetuning-dataset.jsonl",
        help="Path to the JSONL dataset file",
    )
    parser.add_argument(
        "--epochs", type=int, default=3,
        help="Number of training epochs (default: 3)",
    )
    parser.add_argument(
        "--output", type=str, default="./outputs",
        help="Output directory for the fine-tuned model",
    )
    parser.add_argument(
        "--export-gguf", action="store_true",
        help="Export the fine-tuned model to GGUF format for Ollama",
    )
    # ── Nouvelles options v2.0 ──
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Validate dataset and show stats without training (RÈGLE 8)",
    )
    parser.add_argument(
        "--skip-eval", action="store_true",
        help="Skip post-training quality evaluation (faster)",
    )

    args = parser.parse_args()

    if args.dry_run:
        dry_run(args)
    elif args.export_gguf:
        export_gguf(args)
    else:
        train(args)


if __name__ == "__main__":
    main()
