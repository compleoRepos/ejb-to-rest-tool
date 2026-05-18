#!/usr/bin/env python3
"""
Script 5/5 — Entraîne Qwen 2.5 Coder 14B avec QLoRA sur le dataset de migration.
Utilise unsloth pour un entraînement 2x plus rapide et 60% moins de VRAM.

Usage:
    python3 05_train_qlora.py \
        --train ./dataset/final/train.jsonl \
        --val ./dataset/final/val.jsonl \
        --output ./models/qwen-ejb-migrator \
        --epochs 3 \
        --batch-size 2 \
        --lr 2e-4

Prérequis (installer sur EC2 GPU):
    pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
    pip install --no-deps trl peft accelerate bitsandbytes
    pip install datasets transformers

Matériel requis:
    - GPU NVIDIA avec 16+ Go VRAM (T4, A10G, A100)
    - 32 Go RAM système
    - 50 Go espace disque
"""

import os
import sys
import json
import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# ─── Configuration par défaut ────────────────────────────────────────────────

DEFAULT_CONFIG = {
    # Modèle de base
    "base_model": "unsloth/Qwen2.5-Coder-14B-Instruct-bnb-4bit",
    "max_seq_length": 8192,
    "dtype": None,  # Auto-detect (float16 pour T4, bfloat16 pour A100)
    "load_in_4bit": True,
    
    # LoRA
    "lora_r": 32,
    "lora_alpha": 64,
    "lora_dropout": 0.05,
    "target_modules": [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    
    # Entraînement
    "epochs": 3,
    "batch_size": 2,
    "gradient_accumulation_steps": 4,  # Effective batch = 2 * 4 = 8
    "learning_rate": 2e-4,
    "weight_decay": 0.01,
    "warmup_ratio": 0.05,
    "lr_scheduler_type": "cosine",
    "max_grad_norm": 1.0,
    "fp16": True,
    "bf16": False,
    
    # Logging
    "logging_steps": 10,
    "save_steps": 100,
    "eval_steps": 50,
    "save_total_limit": 3,
}

# ─── Fonctions d'entraînement ────────────────────────────────────────────────

def check_gpu():
    """Vérifie la disponibilité du GPU."""
    try:
        import torch
        if not torch.cuda.is_available():
            logger.error("No GPU detected! QLoRA requires a CUDA-capable GPU.")
            sys.exit(1)
        
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_mem / (1024**3)
        logger.info(f"GPU: {gpu_name} ({gpu_mem:.1f} GB VRAM)")
        
        if gpu_mem < 14:
            logger.warning(f"GPU has only {gpu_mem:.1f} GB VRAM. Minimum 16 GB recommended.")
            logger.warning("Consider using a smaller model (7B) or reducing batch size.")
        
        return True
    except ImportError:
        logger.error("PyTorch not installed. Run: pip install torch")
        sys.exit(1)

def load_dataset(train_path: str, val_path: str):
    """Charge le dataset depuis les fichiers JSONL."""
    from datasets import load_dataset as hf_load
    
    data_files = {"train": train_path}
    if val_path and Path(val_path).exists():
        data_files["validation"] = val_path
    
    dataset = hf_load("json", data_files=data_files)
    logger.info(f"Train: {len(dataset['train'])} examples")
    if "validation" in dataset:
        logger.info(f"Val: {len(dataset['validation'])} examples")
    
    return dataset

def setup_model(config: dict):
    """Charge le modèle et configure LoRA."""
    from unsloth import FastLanguageModel
    
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=config["base_model"],
        max_seq_length=config["max_seq_length"],
        dtype=config["dtype"],
        load_in_4bit=config["load_in_4bit"],
    )
    
    model = FastLanguageModel.get_peft_model(
        model,
        r=config["lora_r"],
        target_modules=config["target_modules"],
        lora_alpha=config["lora_alpha"],
        lora_dropout=config["lora_dropout"],
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )
    
    logger.info(f"Model loaded: {config['base_model']}")
    logger.info(f"LoRA rank: {config['lora_r']}, alpha: {config['lora_alpha']}")
    
    # Compter les paramètres entraînables
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    logger.info(f"Trainable params: {trainable:,} / {total:,} ({100*trainable/total:.2f}%)")
    
    return model, tokenizer

def format_chat_template(examples, tokenizer):
    """Applique le template de chat Qwen aux exemples."""
    texts = []
    for messages in examples["messages"]:
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )
        texts.append(text)
    return {"text": texts}

def train(model, tokenizer, dataset, config: dict, output_dir: str):
    """Lance l'entraînement."""
    from trl import SFTTrainer
    from transformers import TrainingArguments
    from unsloth import is_bfloat16_supported
    
    # Formater le dataset
    formatted_dataset = dataset.map(
        lambda x: format_chat_template(x, tokenizer),
        batched=True,
    )
    
    # Arguments d'entraînement
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=config["epochs"],
        per_device_train_batch_size=config["batch_size"],
        gradient_accumulation_steps=config["gradient_accumulation_steps"],
        learning_rate=config["learning_rate"],
        weight_decay=config["weight_decay"],
        warmup_ratio=config["warmup_ratio"],
        lr_scheduler_type=config["lr_scheduler_type"],
        max_grad_norm=config["max_grad_norm"],
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        logging_steps=config["logging_steps"],
        save_steps=config["save_steps"],
        save_total_limit=config["save_total_limit"],
        evaluation_strategy="steps" if "validation" in dataset else "no",
        eval_steps=config["eval_steps"] if "validation" in dataset else None,
        seed=42,
        report_to="none",  # Désactiver wandb par défaut
        optim="adamw_8bit",
    )
    
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=formatted_dataset["train"],
        eval_dataset=formatted_dataset.get("validation"),
        dataset_text_field="text",
        max_seq_length=config["max_seq_length"],
        packing=True,  # Pack short sequences for efficiency
        args=training_args,
    )
    
    logger.info("Starting training...")
    logger.info(f"Epochs: {config['epochs']}")
    logger.info(f"Batch size: {config['batch_size']} x {config['gradient_accumulation_steps']} = {config['batch_size'] * config['gradient_accumulation_steps']}")
    logger.info(f"Learning rate: {config['learning_rate']}")
    
    trainer_stats = trainer.train()
    
    logger.info(f"Training complete!")
    logger.info(f"Total steps: {trainer_stats.global_step}")
    logger.info(f"Training loss: {trainer_stats.training_loss:.4f}")
    
    return trainer

def save_model(model, tokenizer, output_dir: str, config: dict):
    """Sauvegarde le modèle LoRA et exporte en GGUF pour Ollama."""
    from unsloth import FastLanguageModel
    
    # 1. Sauvegarder les poids LoRA
    lora_dir = os.path.join(output_dir, "lora_adapter")
    model.save_pretrained(lora_dir)
    tokenizer.save_pretrained(lora_dir)
    logger.info(f"LoRA adapter saved to {lora_dir}")
    
    # 2. Exporter en GGUF Q4_K_M pour Ollama
    gguf_dir = os.path.join(output_dir, "gguf")
    logger.info("Exporting to GGUF Q4_K_M format (for Ollama)...")
    model.save_pretrained_gguf(
        gguf_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )
    logger.info(f"GGUF model saved to {gguf_dir}")
    
    # 3. Créer le Modelfile pour Ollama
    gguf_files = list(Path(gguf_dir).glob("*.gguf"))
    if gguf_files:
        gguf_filename = gguf_files[0].name
        modelfile_content = f"""FROM ./{gguf_filename}

TEMPLATE \"\"\"{{{{- if .System }}}}<|im_start|>system
{{{{ .System }}}}<|im_end|>
{{{{- end }}}}
<|im_start|>user
{{{{ .Prompt }}}}<|im_end|>
<|im_start|>assistant
\"\"\"

SYSTEM \"\"\"Tu es un expert en migration Java EE/EJB vers Spring Boot. Tu produis du code Spring Boot moderne, propre et compilable en suivant les meilleures pratiques (injection constructeur, @Transactional, Lombok, Spring Data JPA). Tu connais les patterns BMCE Bank et les conventions de nommage bancaires.\"\"\"

PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
PARAMETER stop "<|im_end|>"
"""
        modelfile_path = os.path.join(gguf_dir, "Modelfile")
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        logger.info(f"Ollama Modelfile created at {modelfile_path}")
    
    # 4. Sauvegarder la config d'entraînement
    config_path = os.path.join(output_dir, "training_config.json")
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    logger.info("=" * 60)
    logger.info("Model export complete!")
    logger.info(f"LoRA adapter: {lora_dir}")
    logger.info(f"GGUF model: {gguf_dir}")
    logger.info("")
    logger.info("To deploy on Ollama:")
    logger.info(f"  cd {gguf_dir}")
    logger.info(f"  ollama create qwen-ejb-migrator -f Modelfile")
    logger.info(f"  ollama run qwen-ejb-migrator")
    logger.info("=" * 60)

# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune Qwen Coder with QLoRA")
    parser.add_argument("--train", required=True, help="Training JSONL file")
    parser.add_argument("--val", default=None, help="Validation JSONL file")
    parser.add_argument("--output", default="./models/qwen-ejb-migrator", help="Output directory")
    parser.add_argument("--base-model", default=DEFAULT_CONFIG["base_model"])
    parser.add_argument("--epochs", type=int, default=DEFAULT_CONFIG["epochs"])
    parser.add_argument("--batch-size", type=int, default=DEFAULT_CONFIG["batch_size"])
    parser.add_argument("--lr", type=float, default=DEFAULT_CONFIG["learning_rate"])
    parser.add_argument("--lora-r", type=int, default=DEFAULT_CONFIG["lora_r"])
    parser.add_argument("--max-seq-length", type=int, default=DEFAULT_CONFIG["max_seq_length"])
    parser.add_argument("--config", default=None, help="JSON config file override")
    args = parser.parse_args()
    
    # Charger la config
    config = DEFAULT_CONFIG.copy()
    if args.config:
        with open(args.config) as f:
            config.update(json.load(f))
    config["base_model"] = args.base_model
    config["epochs"] = args.epochs
    config["batch_size"] = args.batch_size
    config["learning_rate"] = args.lr
    config["lora_r"] = args.lora_r
    config["max_seq_length"] = args.max_seq_length
    
    logger.info("=" * 60)
    logger.info("QLoRA Fine-Tuning — Qwen EJB Migrator")
    logger.info(f"Model: {config['base_model']}")
    logger.info(f"Train: {args.train}")
    logger.info(f"Output: {args.output}")
    logger.info("=" * 60)
    
    # Vérifier le GPU
    check_gpu()
    
    # Charger le dataset
    dataset = load_dataset(args.train, args.val)
    
    # Charger le modèle
    model, tokenizer = setup_model(config)
    
    # Entraîner
    trainer = train(model, tokenizer, dataset, config, args.output)
    
    # Sauvegarder et exporter
    save_model(model, tokenizer, args.output, config)
