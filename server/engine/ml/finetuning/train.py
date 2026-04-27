#!/usr/bin/env python3
"""
Fine-tuning script for Java EE → Spring Boot code modernization.
Uses Unsloth + LoRA for efficient fine-tuning of CodeLlama or Mistral models.

Prerequisites:
  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
  pip install --no-deps trl peft accelerate bitsandbytes transformers datasets

Usage:
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl
  python train.py --model mistral --dataset ./finetuning-dataset.jsonl --epochs 5

After training, convert to GGUF for Ollama:
  python train.py --export-gguf --output ./ejb-modernizer-gguf

Author: Hamza NORDINE — EJB Client Modernizer
"""

import argparse
import json
import os
import sys
from pathlib import Path

# ============================================================
# Configuration
# ============================================================

SUPPORTED_MODELS = {
    "codellama": "unsloth/codellama-13b-instruct-bnb-4bit",
    "codellama-7b": "unsloth/codellama-7b-instruct-bnb-4bit",
    "mistral": "unsloth/mistral-7b-instruct-v0.3-bnb-4bit",
    "llama3": "unsloth/llama-3-8b-instruct-bnb-4bit",
    "deepseek": "unsloth/deepseek-coder-6.7b-instruct-bnb-4bit",
}

LORA_CONFIG = {
    "r": 16,                    # LoRA rank (higher = more capacity, slower)
    "lora_alpha": 32,           # LoRA scaling factor
    "lora_dropout": 0.05,       # Dropout for regularization
    "target_modules": [         # Layers to apply LoRA
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    "bias": "none",
    "use_gradient_checkpointing": "unsloth",
}

TRAINING_CONFIG = {
    "per_device_train_batch_size": 2,
    "gradient_accumulation_steps": 4,
    "warmup_steps": 10,
    "num_train_epochs": 3,
    "learning_rate": 2e-4,
    "fp16": True,               # Use FP16 for faster training
    "logging_steps": 10,
    "optim": "adamw_8bit",
    "weight_decay": 0.01,
    "lr_scheduler_type": "cosine",
    "seed": 42,
    "output_dir": "./outputs",
    "save_strategy": "epoch",
    "save_total_limit": 2,
}


def load_dataset(dataset_path: str) -> list:
    """Load and validate the JSONL dataset."""
    entries = []
    with open(dataset_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                if "messages" not in entry:
                    print(f"  Warning: Line {i} missing 'messages' field, skipping")
                    continue
                messages = entry["messages"]
                if len(messages) < 3:
                    print(f"  Warning: Line {i} has < 3 messages, skipping")
                    continue
                entries.append(entry)
            except json.JSONDecodeError as e:
                print(f"  Warning: Line {i} invalid JSON: {e}")
    return entries


def format_for_training(entries: list, tokenizer) -> list:
    """Convert JSONL entries to the chat template format expected by the model."""
    formatted = []
    for entry in entries:
        messages = entry["messages"]
        # Use the tokenizer's chat template to format
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


def print_dataset_stats(entries: list):
    """Print dataset statistics."""
    categories = {}
    methods = {}
    for entry in entries:
        meta = entry.get("metadata", {})
        cat = meta.get("category", "unknown")
        method = meta.get("method", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
        methods[method] = methods.get(method, 0) + 1

    print("\n╔══════════════════════════════════════════╗")
    print("║       Dataset Statistics                 ║")
    print("╠══════════════════════════════════════════╣")
    print(f"║  Total entries: {len(entries):>6}                   ║")
    print("╠══════════════════════════════════════════╣")
    print("║  By category:                            ║")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        bar = "█" * min(count // 5, 20)
        print(f"║    {cat:<22} {count:>4} {bar}")
    print("╠══════════════════════════════════════════╣")
    print("║  By method:                              ║")
    for method, count in sorted(methods.items(), key=lambda x: -x[1]):
        print(f"║    {method:<22} {count:>4}              ║")
    print("╚══════════════════════════════════════════╝")


def train(args):
    """Main training function."""
    print("=" * 60)
    print("  EJB Client Modernizer — Fine-tuning Pipeline")
    print("  Java EE → Spring Boot Code Transformation")
    print("=" * 60)

    # ── Step 1: Load dataset ──
    print(f"\n[1/6] Loading dataset from {args.dataset}...")
    entries = load_dataset(args.dataset)
    if not entries:
        print("ERROR: No valid entries found in dataset!")
        sys.exit(1)
    print_dataset_stats(entries)

    # ── Step 2: Load model ──
    model_id = SUPPORTED_MODELS.get(args.model)
    if not model_id:
        print(f"ERROR: Unknown model '{args.model}'. Supported: {list(SUPPORTED_MODELS.keys())}")
        sys.exit(1)

    print(f"\n[2/6] Loading model: {model_id}")
    print("  This may take a few minutes on first run (downloading weights)...")

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("\nERROR: Unsloth not installed. Install with:")
        print('  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"')
        print('  pip install --no-deps trl peft accelerate bitsandbytes transformers datasets')
        sys.exit(1)

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_id,
        max_seq_length=4096,
        dtype=None,             # Auto-detect (float16 for V100, bfloat16 for A100)
        load_in_4bit=True,      # 4-bit quantization for memory efficiency
    )

    # ── Step 3: Apply LoRA ──
    print(f"\n[3/6] Applying LoRA adapters (rank={LORA_CONFIG['r']})...")
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

    # Print trainable parameters
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"  Trainable parameters: {trainable:,} / {total:,} ({100 * trainable / total:.2f}%)")

    # ── Step 4: Prepare dataset ──
    print(f"\n[4/6] Formatting dataset for training...")
    formatted_data = format_for_training(entries, tokenizer)

    from datasets import Dataset
    train_dataset = Dataset.from_list(formatted_data)
    print(f"  Training examples: {len(train_dataset)}")

    # ── Step 5: Train ──
    print(f"\n[5/6] Starting training...")
    print(f"  Epochs: {args.epochs}")
    print(f"  Batch size: {TRAINING_CONFIG['per_device_train_batch_size']}")
    print(f"  Gradient accumulation: {TRAINING_CONFIG['gradient_accumulation_steps']}")
    print(f"  Effective batch size: {TRAINING_CONFIG['per_device_train_batch_size'] * TRAINING_CONFIG['gradient_accumulation_steps']}")
    print(f"  Learning rate: {TRAINING_CONFIG['learning_rate']}")

    from trl import SFTTrainer
    from transformers import TrainingArguments

    training_args = TrainingArguments(
        **{**TRAINING_CONFIG, "num_train_epochs": args.epochs, "output_dir": args.output}
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        dataset_text_field="text",
        max_seq_length=4096,
        dataset_num_proc=2,
        packing=True,           # Pack short examples together for efficiency
        args=training_args,
    )

    # Print GPU info
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_mem / 1e9
            print(f"  GPU: {gpu_name} ({gpu_mem:.1f} GB)")
        else:
            print("  WARNING: No GPU detected. Training will be very slow on CPU.")
    except Exception:
        pass

    trainer_stats = trainer.train()
    print(f"\n  Training complete!")
    print(f"  Training loss: {trainer_stats.training_loss:.4f}")
    print(f"  Training time: {trainer_stats.metrics['train_runtime']:.0f}s")

    # ── Step 6: Save ──
    print(f"\n[6/6] Saving model to {args.output}...")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"  LoRA adapters saved to: {args.output}")

    # Save training metadata
    metadata = {
        "base_model": model_id,
        "model_alias": args.model,
        "dataset": args.dataset,
        "dataset_entries": len(entries),
        "epochs": args.epochs,
        "lora_config": LORA_CONFIG,
        "training_loss": trainer_stats.training_loss,
        "training_time_seconds": trainer_stats.metrics["train_runtime"],
    }
    with open(os.path.join(args.output, "training_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print("\n" + "=" * 60)
    print("  Training complete!")
    print(f"  Model saved to: {args.output}")
    print(f"  To convert to GGUF for Ollama, run:")
    print(f"    python train.py --export-gguf --output {args.output}")
    print("=" * 60)


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

    # Load training metadata
    metadata_path = os.path.join(output_dir, "training_metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path) as f:
            metadata = json.load(f)
        base_model = metadata["base_model"]
        print(f"  Base model: {base_model}")
    else:
        print("  WARNING: No training_metadata.json found, using default model")
        base_model = SUPPORTED_MODELS.get(args.model, SUPPORTED_MODELS["codellama"])

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=output_dir,
        max_seq_length=4096,
        dtype=None,
        load_in_4bit=True,
    )

    print(f"\n[2/3] Converting to GGUF (Q4_K_M quantization)...")
    os.makedirs(gguf_dir, exist_ok=True)

    # Unsloth provides a convenient save method for GGUF
    model.save_pretrained_gguf(
        gguf_dir,
        tokenizer,
        quantization_method="q4_k_m",  # Good balance of quality/size
    )

    print(f"\n[3/3] GGUF model saved to: {gguf_dir}")

    # Find the GGUF file
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
        print("  WARNING: No GGUF file found in output directory")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Fine-tune a LLM for Java EE → Spring Boot code modernization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with CodeLlama 13B (recommended)
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl

  # Train with Mistral 7B (faster, less VRAM)
  python train.py --model mistral --dataset ./finetuning-dataset.jsonl --epochs 5

  # Train with DeepSeek Coder (good for code tasks)
  python train.py --model deepseek --dataset ./finetuning-dataset.jsonl

  # Export to GGUF for Ollama
  python train.py --export-gguf --output ./outputs

  # Full pipeline
  python train.py --model codellama --dataset ./finetuning-dataset.jsonl
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

    args = parser.parse_args()

    if args.export_gguf:
        export_gguf(args)
    else:
        train(args)


if __name__ == "__main__":
    main()
