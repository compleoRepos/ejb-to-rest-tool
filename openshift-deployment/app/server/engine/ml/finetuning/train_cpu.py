"""
Fine-tuning CPU pour EJB Client Modernizer — Qwen2.5-Coder 1.5B
Optimisé pour laptop sans GPU puissant (MX150 2GB VRAM, 16 Go RAM).

Utilise Transformers + PEFT (LoRA) + TRL en mode CPU pur.
Sous-ensemble stratifié du dataset pour un entraînement en ~2-4h.

Usage:
  python train_cpu.py --dataset ./finetuning-dataset.jsonl
  python train_cpu.py --dataset ./finetuning-dataset.jsonl --max-samples 2000
  python train_cpu.py --dataset ./finetuning-dataset.jsonl --epochs 3 --dry-run
  python train_cpu.py --resume ./outputs/checkpoint-500

Author: Compleo — EJB Client Modernizer
"""

import argparse
import json
import os
import sys
import time
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    EarlyStoppingCallback,
)
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer

# ============================================================
# Configuration
# ============================================================

MODEL_ID = "Qwen/Qwen2.5-Coder-1.5B-Instruct"

LORA_CONFIG = {
    "r": 8,                     # LoRA rank (réduit pour CPU)
    "lora_alpha": 16,           # Scaling factor
    "lora_dropout": 0.05,
    "target_modules": [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    "bias": "none",
    "task_type": TaskType.CAUSAL_LM,
}

TRAINING_DEFAULTS = {
    "per_device_train_batch_size": 1,
    "gradient_accumulation_steps": 8,
    "warmup_steps": 10,
    "learning_rate": 2e-4,
    "fp16": False,              # CPU = pas de fp16
    "bf16": False,
    "logging_steps": 10,
    "optim": "adamw_torch",     # CPU-compatible optimizer
    "weight_decay": 0.01,
    "lr_scheduler_type": "cosine",
    "seed": 42,
    "save_strategy": "steps",
    "save_steps": 200,
    "save_total_limit": 3,
    "eval_strategy": "steps",
    "eval_steps": 200,
    "load_best_model_at_end": True,
    "metric_for_best_model": "eval_loss",
    "greater_is_better": False,
    "dataloader_num_workers": 0,  # CPU: pas de multiprocessing
    "max_grad_norm": 1.0,
    "report_to": "none",
}

MAX_SEQ_LENGTH = 2048  # Réduit pour CPU/RAM

# ============================================================
# Dataset loading & stratified sampling
# ============================================================

def load_dataset_jsonl(path: str, max_samples: int = 5000) -> tuple:
    """Load JSONL dataset with stratified sampling by category."""
    print(f"\n{'='*60}")
    print(f"  Chargement du dataset: {path}")
    print(f"  Max samples: {max_samples}")
    print(f"{'='*60}\n")

    entries = []
    categories = Counter()

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entries.append(entry)
                # Extract category from system prompt or metadata
                cat = entry.get("category", "unknown")
                if cat == "unknown" and "messages" in entry:
                    for msg in entry["messages"]:
                        if msg.get("role") == "system":
                            content = msg["content"].lower()
                            for c in ["struts", "hibernate", "servlet", "jdbc", "soap", "jms", "ejb", "spring"]:
                                if c in content:
                                    cat = c
                                    break
                categories[cat] += 1
            except json.JSONDecodeError:
                continue

    total = len(entries)
    print(f"  Total entrées: {total}")
    print(f"  Catégories: {dict(categories)}")

    if total <= max_samples:
        selected = entries
    else:
        # Stratified sampling: proportional per category
        selected = []
        cat_entries = defaultdict(list)
        for e in entries:
            cat = e.get("category", "unknown")
            cat_entries[cat].append(e)

        for cat, cat_list in cat_entries.items():
            proportion = len(cat_list) / total
            n = max(1, int(proportion * max_samples))
            selected.extend(random.sample(cat_list, min(n, len(cat_list))))

        # Fill remaining slots randomly
        remaining = max_samples - len(selected)
        if remaining > 0:
            pool = [e for e in entries if e not in selected]
            selected.extend(random.sample(pool, min(remaining, len(pool))))

        random.shuffle(selected)

    print(f"  Échantillon sélectionné: {len(selected)} entrées")

    # Convert to chat format
    formatted = []
    for entry in selected:
        if "messages" in entry:
            messages = entry["messages"]
        elif "instruction" in entry and "output" in entry:
            messages = [
                {"role": "system", "content": "Tu es un expert en modernisation Java EE vers Spring Boot."},
                {"role": "user", "content": entry["instruction"]},
                {"role": "assistant", "content": entry["output"]},
            ]
        else:
            continue
        formatted.append({"messages": messages})

    # Split 95/5
    split_idx = int(len(formatted) * 0.95)
    train_data = formatted[:split_idx]
    eval_data = formatted[split_idx:]

    print(f"  Train: {len(train_data)} | Eval: {len(eval_data)}")
    return train_data, eval_data


def format_chat(example, tokenizer):
    """Format messages into chat template string."""
    text = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": text}


# ============================================================
# Training
# ============================================================

def train(args):
    start_time = time.time()

    print(f"\n{'='*60}")
    print(f"  EJB Client Modernizer — Fine-tuning CPU")
    print(f"  Modèle: {MODEL_ID}")
    print(f"  Device: CPU (i7-8550U + 16 Go RAM)")
    print(f"  LoRA rank: {LORA_CONFIG['r']}")
    print(f"  Epochs: {args.epochs}")
    print(f"{'='*60}\n")

    # 1. Load dataset
    train_data, eval_data = load_dataset_jsonl(args.dataset, args.max_samples)

    if args.dry_run:
        print("\n[DRY RUN] Dataset validé. Arrêt avant entraînement.")
        print(f"  Train samples: {len(train_data)}")
        print(f"  Eval samples: {len(eval_data)}")
        print(f"  Exemple (premier message user):")
        if train_data:
            for msg in train_data[0]["messages"]:
                if msg["role"] == "user":
                    print(f"    {msg['content'][:200]}...")
                    break
        return

    # 2. Load tokenizer
    print("\n[1/5] Chargement du tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # 3. Load model (CPU, float32)
    print("[2/5] Chargement du modèle (CPU, float32)...")
    print("       Cela peut prendre 2-3 minutes...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,
        device_map="cpu",
        trust_remote_code=True,
    )
    model.config.use_cache = False  # Required for gradient checkpointing

    # 4. Apply LoRA
    print("[3/5] Application de LoRA...")
    lora_config = LoraConfig(**LORA_CONFIG)
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 5. Prepare datasets
    print("[4/5] Préparation des datasets...")
    train_dataset = Dataset.from_list(train_data)
    eval_dataset = Dataset.from_list(eval_data)

    train_dataset = train_dataset.map(
        lambda x: format_chat(x, tokenizer),
        remove_columns=["messages"],
    )
    eval_dataset = eval_dataset.map(
        lambda x: format_chat(x, tokenizer),
        remove_columns=["messages"],
    )

    # 6. Training arguments
    output_dir = args.output or "./outputs"
    os.makedirs(output_dir, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=args.epochs,
        **TRAINING_DEFAULTS,
    )

    # 7. Create trainer
    print("[5/5] Lancement de l'entraînement...")
    print(f"       Output: {output_dir}")
    print(f"       Epochs: {args.epochs}")
    print(f"       Batch: {TRAINING_DEFAULTS['per_device_train_batch_size']} x {TRAINING_DEFAULTS['gradient_accumulation_steps']} grad_accum")
    print(f"       Effective batch: {TRAINING_DEFAULTS['per_device_train_batch_size'] * TRAINING_DEFAULTS['gradient_accumulation_steps']}")
    print(f"       Max seq length: {MAX_SEQ_LENGTH}")
    print()

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        args=training_args,
        max_seq_length=MAX_SEQ_LENGTH,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    # Resume from checkpoint if specified
    resume_from = args.resume if args.resume else None
    trainer.train(resume_from_checkpoint=resume_from)

    # 8. Save final model
    print("\n[SAVE] Sauvegarde du modèle final...")
    final_dir = os.path.join(output_dir, "final")
    trainer.save_model(final_dir)
    tokenizer.save_pretrained(final_dir)

    # 9. Export to GGUF for Ollama
    if args.export_gguf:
        export_to_gguf(final_dir, output_dir)

    # 10. Training report
    elapsed = time.time() - start_time
    report = {
        "model": MODEL_ID,
        "lora_rank": LORA_CONFIG["r"],
        "train_samples": len(train_data),
        "eval_samples": len(eval_data),
        "epochs": args.epochs,
        "elapsed_seconds": int(elapsed),
        "elapsed_human": f"{int(elapsed // 3600)}h {int((elapsed % 3600) // 60)}m",
        "output_dir": output_dir,
        "final_model": final_dir,
    }

    report_path = os.path.join(output_dir, "training-report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Entraînement terminé !")
    print(f"  Durée: {report['elapsed_human']}")
    print(f"  Modèle: {final_dir}")
    print(f"  Rapport: {report_path}")
    print(f"{'='*60}\n")


def export_to_gguf(model_dir: str, output_dir: str):
    """Export LoRA model to GGUF format for Ollama."""
    print("\n[EXPORT] Conversion en GGUF pour Ollama...")
    try:
        from transformers import AutoModelForCausalLM as AMCLM
        # Merge LoRA weights
        from peft import PeftModel

        base_model = AMCLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float32,
            device_map="cpu",
        )
        model = PeftModel.from_pretrained(base_model, model_dir)
        merged = model.merge_and_unload()

        merged_dir = os.path.join(output_dir, "merged")
        merged.save_pretrained(merged_dir)

        print(f"  Modèle mergé sauvegardé: {merged_dir}")
        print(f"  Pour convertir en GGUF, utilisez llama.cpp:")
        print(f"    python convert_hf_to_gguf.py {merged_dir} --outtype q4_K_M")
        print(f"  Puis créez le modèle Ollama:")
        print(f"    ollama create ejb-modernizer-ft -f Modelfile")

    except Exception as e:
        print(f"  [WARN] Export GGUF échoué: {e}")
        print(f"  Le modèle LoRA est disponible dans: {model_dir}")


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tuning CPU pour EJB Client Modernizer")
    parser.add_argument("--dataset", required=True, help="Chemin vers le fichier JSONL du dataset")
    parser.add_argument("--max-samples", type=int, default=5000, help="Nombre max d'échantillons (défaut: 5000)")
    parser.add_argument("--epochs", type=int, default=2, help="Nombre d'epochs (défaut: 2)")
    parser.add_argument("--output", default="./outputs", help="Répertoire de sortie")
    parser.add_argument("--resume", default=None, help="Reprendre depuis un checkpoint")
    parser.add_argument("--dry-run", action="store_true", help="Valider le dataset sans entraîner")
    parser.add_argument("--export-gguf", action="store_true", help="Exporter en GGUF après entraînement")

    args = parser.parse_args()
    train(args)
