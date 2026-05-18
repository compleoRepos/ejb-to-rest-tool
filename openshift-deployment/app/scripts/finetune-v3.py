#!/usr/bin/env python3
"""
Fine-tune qwen2.5-coder:7b with QLoRA 4-bit on NVIDIA L4 (g6.xlarge).
v4-L4: BF16 native (L4 supports BF16 natively) + gradient checkpointing + seq=512.
Expected: ~30-50 sec/step → ~24-36h total for 95K samples.
"""
import os
import json
import sys
import gc
import torch

# Config
MODEL_NAME = "Qwen/Qwen2.5-Coder-7B-Instruct"
DATASET_FILE = "/tmp/finetuning-massive-dataset.jsonl"
OUTPUT_DIR = "/tmp/ejb-modernizer-finetuned"
MAX_SEQ_LENGTH = 512   # Short sequences to save VRAM
BATCH_SIZE = 4         # L4 has 22.5 GB - can handle batch=4
GRADIENT_ACCUMULATION = 8  # Effective batch = 32
LEARNING_RATE = 2e-4
NUM_EPOCHS = 1
WARMUP_STEPS = 100
SAVE_STEPS = 500
LOGGING_STEPS = 25
LORA_R = 16
LORA_ALPHA = 32
MAX_SAMPLES = 95000

def main():
    print("=" * 60)
    print("QLoRA Fine-tuning v4-L4: qwen2.5-coder:7b -> ejb-modernizer")
    print(f"GPU: {torch.cuda.get_device_name(0)} ({torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB)")
    print(f"BF16 support: {torch.cuda.is_bf16_supported()}")
    print("Mode: BF16 native + QLoRA 4-bit + gradient checkpointing")
    print("=" * 60)

    # Step 1: Load dataset
    print("\n[1/5] Loading dataset...")
    from datasets import Dataset
    
    data = []
    with open(DATASET_FILE, 'r') as f:
        for i, line in enumerate(f):
            if i >= MAX_SAMPLES:
                break
            entry = json.loads(line.strip())
            msgs = entry.get("messages", [])
            if len(msgs) >= 3:
                text = f"<|im_start|>system\n{msgs[0]['content']}<|im_end|>\n<|im_start|>user\n{msgs[1]['content']}<|im_end|>\n<|im_start|>assistant\n{msgs[2]['content']}<|im_end|>"
                data.append({"text": text})
    
    dataset = Dataset.from_list(data)
    print(f"  Loaded {len(dataset):,} training examples")

    # Step 2: Load model with 4-bit quantization (BF16 compute on L4)
    print("\n[2/5] Loading model with 4-bit quantization (BF16 compute)...")
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,  # L4 supports BF16 natively
        bnb_4bit_use_double_quant=True,
    )
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,  # BF16 for L4
    )
    
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    
    print(f"  GPU Memory after load: {torch.cuda.memory_allocated()/1e9:.1f} GB / {torch.cuda.get_device_properties(0).total_memory/1e9:.1f} GB")

    # Step 3: Add LoRA
    print("\n[3/5] Adding LoRA adapters...")
    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                         "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    
    model = get_peft_model(model, lora_config)
    model.gradient_checkpointing_enable()
    
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"  Trainable: {trainable:,} / {total:,} ({100*trainable/total:.2f}%)")
    print(f"  GPU Memory: {torch.cuda.memory_allocated()/1e9:.1f} GB / {torch.cuda.get_device_properties(0).total_memory/1e9:.1f} GB")

    # Step 4: Train with BF16 (native on L4)
    print("\n[4/5] Starting training (BF16 native on L4)...")
    from trl import SFTTrainer, SFTConfig
    
    sft_config = SFTConfig(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        learning_rate=LEARNING_RATE,
        num_train_epochs=NUM_EPOCHS,
        warmup_steps=WARMUP_STEPS,
        save_steps=SAVE_STEPS,
        logging_steps=LOGGING_STEPS,
        save_total_limit=3,
        fp16=False,    # NOT FP16
        bf16=True,     # BF16 native on L4!
        optim="adamw_torch",
        lr_scheduler_type="cosine",
        seed=42,
        report_to="none",
        max_grad_norm=0.3,
        dataloader_num_workers=2,
        remove_unused_columns=False,
        dataset_text_field="text",
        max_length=MAX_SEQ_LENGTH,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
    )
    
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=sft_config,
    )
    
    total_steps = (len(dataset) // (BATCH_SIZE * GRADIENT_ACCUMULATION)) * NUM_EPOCHS
    print(f"  Total steps: ~{total_steps:,}")
    print(f"  Estimated time: ~{total_steps * 40 / 3600:.1f} hours on L4 (BF16)")
    
    result = trainer.train()
    print(f"\n  Training complete!")
    print(f"  Loss: {result.training_loss:.4f}")
    print(f"  Runtime: {result.metrics['train_runtime']/3600:.1f} hours")

    # Step 5: Save
    print("\n[5/5] Saving model...")
    lora_dir = os.path.join(OUTPUT_DIR, "lora-adapters")
    model.save_pretrained(lora_dir)
    tokenizer.save_pretrained(lora_dir)
    print(f"  LoRA adapters saved to {lora_dir}")
    
    # Export to GGUF for Ollama
    print("  Exporting to GGUF (this may take a while)...")
    
    from peft import AutoPeftModelForCausalLM
    
    del model
    del trainer
    gc.collect()
    torch.cuda.empty_cache()
    
    merged_model = AutoPeftModelForCausalLM.from_pretrained(
        lora_dir,
        device_map="auto",
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    merged_model = merged_model.merge_and_unload()
    
    merged_dir = os.path.join(OUTPUT_DIR, "merged")
    merged_model.save_pretrained(merged_dir)
    tokenizer.save_pretrained(merged_dir)
    print(f"  Merged model saved to {merged_dir}")
    
    print("  Converting to GGUF Q4_K_M...")
    gguf_dir = os.path.join(OUTPUT_DIR, "gguf")
    os.makedirs(gguf_dir, exist_ok=True)
    
    os.system("pip install -q gguf sentencepiece protobuf")
    
    if not os.path.exists("/tmp/llama.cpp"):
        os.system("git clone --depth=1 https://github.com/ggerganov/llama.cpp /tmp/llama.cpp")
    
    gguf_output = os.path.join(gguf_dir, "ejb-modernizer-q4_k_m.gguf")
    
    ret = os.system(f"python3 /tmp/llama.cpp/convert_hf_to_gguf.py {merged_dir} --outfile {gguf_output} --outtype q4_k_m")
    
    if ret == 0 and os.path.exists(gguf_output):
        print(f"  GGUF saved: {gguf_output}")
        size_gb = os.path.getsize(gguf_output) / 1e9
        print(f"  Size: {size_gb:.1f} GB")
        
        modelfile_content = f"""FROM {gguf_output}
TEMPLATE \"\"\"<|im_start|>system
{{{{.System}}}}<|im_end|>
<|im_start|>user
{{{{.Prompt}}}}<|im_end|>
<|im_start|>assistant
\"\"\"
SYSTEM \"\"\"Tu es un expert en modernisation Java EE vers Spring Boot 3.x. Tu analyses le code legacy (EJB, Servlet, JDBC, Hibernate, Struts, SOAP, JMS, JSP) et tu le transformes en code Spring Boot moderne.\"\"\"
PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 4096
PARAMETER stop "<|im_end|>"
"""
        modelfile_path = os.path.join(OUTPUT_DIR, "Modelfile")
        with open(modelfile_path, 'w') as f:
            f.write(modelfile_content)
        
        ret2 = os.system(f"ollama create ejb-modernizer -f {modelfile_path}")
        if ret2 == 0:
            print("  Ollama model 'ejb-modernizer' created!")
            os.system("ollama list")
        else:
            print(f"  Ollama create failed (code {ret2}). Manual: ollama create ejb-modernizer -f {modelfile_path}")
    else:
        print(f"  GGUF conversion failed. LoRA adapters are at {lora_dir}")
        print(f"  You can merge manually later.")
    
    print("\n" + "=" * 60)
    print("Fine-tuning pipeline complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
