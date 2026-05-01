#!/usr/bin/env python3
"""
Génère des entrées de dataset d'entraînement (format OpenAI JSONL)
à partir des 19 projets bancaires et de leur code généré.

Produit 3 types d'entrées :
  1. UC Legacy → Service Spring Boot (migration métier)
  2. DTO Legacy → DTO Spring Boot (migration DTOs)
  3. Full-class Legacy → Full-class Spring Boot (migration complète)

Sortie : finetuning-banking-projects.jsonl
"""

import json
import os
import re
import glob
from pathlib import Path

PROJECTS_DIRS = [
    "/home/ubuntu/pipeline-test/projects1",
    "/home/ubuntu/pipeline-test/projects2",
    "/home/ubuntu/pipeline-test/projects3",
]
RESULTS_DIR = "/home/ubuntu/pipeline-test/results"
OUTPUT_FILE = "/home/ubuntu/ejb-client-modernizer/server/engine/ml/finetuning/finetuning-banking-projects.jsonl"

SYSTEM_PROMPT_BACKEND = (
    "You are ejb-modernizer, a specialized AI for migrating Java EE legacy applications "
    "to modern Spring Boot microservices. You detect business domains and align generated "
    "code with industry standards (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF). "
    "Generate production-ready Spring Boot 3.x code with proper annotations, validation, "
    "audit trail logging, and exception handling."
)

SYSTEM_PROMPT_DTO = (
    "You are ejb-modernizer, a specialized AI for migrating Java EE legacy DTOs and "
    "Value Objects to modern Spring Boot DTOs with Bean Validation (jakarta.validation), "
    "Lombok, and Builder pattern."
)

SYSTEM_PROMPT_FULL = (
    "You are ejb-modernizer, a specialized AI for migrating complete Java EE legacy classes "
    "(EJB, Servlet, Struts, SOAP, JDBC) to modern Spring Boot 3.x microservices with "
    "proper layered architecture (Controller, Service, Repository, DTO)."
)

def read_file(path):
    """Lit un fichier et retourne son contenu."""
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except:
        return None

def find_java_files(directory):
    """Trouve tous les fichiers Java dans un répertoire."""
    return sorted(glob.glob(os.path.join(directory, "**/*.java"), recursive=True))

def classify_legacy_file(content, filename):
    """Classifie un fichier Java legacy par type."""
    if not content:
        return "unknown"
    
    # UC / Use Case
    if re.search(r'@Stateless|@Stateful|@Singleton', content) and re.search(r'class\s+\w+UC\b|class\s+\w+UseCase\b', content):
        return "ejb_usecase"
    if re.search(r'class\s+\w+UC\b', content):
        return "usecase"
    
    # EJB Session Bean
    if re.search(r'@Stateless|@Stateful|@Singleton', content):
        return "ejb_session_bean"
    
    # Servlet
    if re.search(r'extends\s+HttpServlet|@WebServlet', content):
        return "servlet"
    
    # DAO / Repository
    if re.search(r'class\s+\w+Dao\b|class\s+\w+DAO\b|class\s+\w+Repository\b', content):
        return "dao"
    
    # DTO / Value Object
    if re.search(r'class\s+\w+Dto\b|class\s+\w+DTO\b|class\s+\w+Vo\b|class\s+\w+VO\b|class\s+\w+VoIn\b|class\s+\w+VoOut\b', content):
        return "dto"
    
    # SOAP
    if re.search(r'@WebService|@WebMethod', content):
        return "soap"
    
    # JDBC
    if re.search(r'PreparedStatement|ResultSet|DriverManager|getConnection', content):
        return "jdbc"
    
    return "other"

def classify_generated_file(content, filename):
    """Classifie un fichier Java généré par type."""
    if not content:
        return "unknown"
    
    if re.search(r'@RestController', content):
        return "controller"
    if re.search(r'@Service', content):
        return "service"
    if re.search(r'@Repository|interface\s+\w+Repository', content):
        return "repository"
    if re.search(r'@Entity', content):
        return "entity"
    if re.search(r'class\s+\w+(?:Request|Response)DTO\b', content):
        return "dto"
    if re.search(r'class\s+\w+Dto\b|class\s+\w+DTO\b', content):
        return "dto_legacy"
    if re.search(r'@Component.*Adapter|class\s+\w+Adapter\b', content):
        return "adapter"
    
    return "other"

def extract_class_name(content):
    """Extrait le nom de la classe d'un fichier Java."""
    match = re.search(r'(?:public\s+)?(?:abstract\s+)?class\s+(\w+)', content)
    return match.group(1) if match else None

def create_entry(system_prompt, user_content, assistant_content, metadata=None):
    """Crée une entrée de dataset au format OpenAI."""
    entry = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": assistant_content}
        ]
    }
    if metadata:
        entry["metadata"] = metadata
    return entry

def match_uc_to_service(uc_name, generated_services):
    """Trouve le service généré correspondant à un UC."""
    # Nettoyer le nom du UC
    base_name = re.sub(r'UC$|UseCase$', '', uc_name)
    
    for svc_path, svc_content in generated_services.items():
        svc_name = Path(svc_path).stem
        # Vérifier si le service contient une référence au UC
        if uc_name in svc_content or base_name.lower() in svc_content.lower():
            return svc_path, svc_content
    
    return None, None

def match_dto_to_generated(dto_name, generated_dtos):
    """Trouve le DTO généré correspondant à un DTO legacy."""
    base_name = re.sub(r'Dto$|DTO$|Vo$|VO$|VoIn$|VoOut$', '', dto_name)
    
    for dto_path, dto_content in generated_dtos.items():
        gen_name = Path(dto_path).stem
        if base_name.lower() in gen_name.lower():
            return dto_path, dto_content
    
    return None, None

def process_project(project_name, source_dir, result_dir):
    """Traite un projet et génère les entrées de dataset."""
    entries = []
    
    if not os.path.exists(result_dir):
        return entries
    
    # Lire les fichiers source
    source_files = {}
    for java_file in find_java_files(source_dir):
        content = read_file(java_file)
        if content and len(content) > 50:
            file_type = classify_legacy_file(content, java_file)
            source_files[java_file] = {
                "content": content,
                "type": file_type,
                "name": extract_class_name(content) or Path(java_file).stem
            }
    
    # Lire les fichiers générés
    generated_files = {}
    for java_file in find_java_files(result_dir):
        content = read_file(java_file)
        if content and len(content) > 50:
            file_type = classify_generated_file(content, java_file)
            generated_files[java_file] = {
                "content": content,
                "type": file_type,
                "name": extract_class_name(content) or Path(java_file).stem
            }
    
    # Séparer par type
    legacy_ucs = {k: v for k, v in source_files.items() if v["type"] in ("ejb_usecase", "usecase")}
    legacy_dtos = {k: v for k, v in source_files.items() if v["type"] == "dto"}
    legacy_ejbs = {k: v for k, v in source_files.items() if v["type"] == "ejb_session_bean"}
    legacy_daos = {k: v for k, v in source_files.items() if v["type"] == "dao"}
    legacy_servlets = {k: v for k, v in source_files.items() if v["type"] == "servlet"}
    legacy_soaps = {k: v for k, v in source_files.items() if v["type"] == "soap"}
    legacy_jdbcs = {k: v for k, v in source_files.items() if v["type"] == "jdbc"}
    
    gen_services = {k: v["content"] for k, v in generated_files.items() if v["type"] == "service"}
    gen_controllers = {k: v["content"] for k, v in generated_files.items() if v["type"] == "controller"}
    gen_dtos = {k: v["content"] for k, v in generated_files.items() if v["type"] in ("dto", "dto_legacy")}
    gen_repos = {k: v["content"] for k, v in generated_files.items() if v["type"] == "repository"}
    gen_adapters = {k: v["content"] for k, v in generated_files.items() if v["type"] == "adapter"}
    
    # === Type 1 : UC Legacy → Service Spring Boot ===
    for uc_path, uc_info in legacy_ucs.items():
        svc_path, svc_content = match_uc_to_service(uc_info["name"], gen_services)
        if svc_content:
            user_msg = (
                f"Migrate this EJB Use Case from project '{project_name}' to a Spring Boot Service "
                f"aligned with BIAN banking standard:\n\n```java\n{uc_info['content']}\n```"
            )
            assistant_msg = f"```java\n{svc_content}\n```"
            
            entries.append(create_entry(
                SYSTEM_PROMPT_BACKEND,
                user_msg,
                assistant_msg,
                {"project": project_name, "type": "uc_to_service", "source": uc_info["name"], "category": "ejb_session_bean"}
            ))
    
    # === Type 2 : DTO Legacy → DTO Spring Boot ===
    for dto_path, dto_info in legacy_dtos.items():
        gen_dto_path, gen_dto_content = match_dto_to_generated(dto_info["name"], gen_dtos)
        if gen_dto_content:
            user_msg = (
                f"Migrate this legacy DTO/ValueObject from project '{project_name}' to a modern "
                f"Spring Boot DTO with Lombok and Bean Validation:\n\n```java\n{dto_info['content']}\n```"
            )
            assistant_msg = f"```java\n{gen_dto_content}\n```"
            
            entries.append(create_entry(
                SYSTEM_PROMPT_DTO,
                user_msg,
                assistant_msg,
                {"project": project_name, "type": "dto_migration", "source": dto_info["name"], "category": "dto"}
            ))
    
    # === Type 3 : EJB/Servlet/SOAP → Service + Controller (full migration) ===
    for ejb_path, ejb_info in {**legacy_ejbs, **legacy_servlets, **legacy_soaps}.items():
        # Trouver le service correspondant
        svc_path, svc_content = match_uc_to_service(ejb_info["name"], gen_services)
        if not svc_content:
            continue
        
        # Trouver le controller correspondant
        ctrl_content = None
        for ctrl_path, ctrl_c in gen_controllers.items():
            if ejb_info["name"].lower().replace("bean", "").replace("servlet", "").replace("handler", "") in ctrl_c.lower():
                ctrl_content = ctrl_c
                break
        
        combined_output = svc_content
        if ctrl_content:
            combined_output += f"\n\n// --- Controller ---\n\n{ctrl_content}"
        
        user_msg = (
            f"Migrate this complete legacy Java EE class from project '{project_name}' to "
            f"Spring Boot microservice architecture (Service + Controller + DTO):\n\n"
            f"```java\n{ejb_info['content']}\n```"
        )
        assistant_msg = f"```java\n{combined_output}\n```"
        
        entries.append(create_entry(
            SYSTEM_PROMPT_FULL,
            user_msg,
            assistant_msg,
            {"project": project_name, "type": "full_migration", "source": ejb_info["name"], "category": ejb_info["type"]}
        ))
    
    # === Type 4 : DAO/JDBC → Repository Spring Data ===
    for dao_path, dao_info in {**legacy_daos, **legacy_jdbcs}.items():
        for repo_path, repo_content in gen_repos.items():
            repo_name = Path(repo_path).stem
            dao_base = re.sub(r'Dao$|DAO$|Impl$', '', dao_info["name"])
            if dao_base.lower() in repo_name.lower() or dao_info["name"].lower() in repo_content.lower():
                user_msg = (
                    f"Migrate this legacy JDBC DAO from project '{project_name}' to a Spring Data JPA Repository:\n\n"
                    f"```java\n{dao_info['content']}\n```"
                )
                assistant_msg = f"```java\n{repo_content}\n```"
                
                entries.append(create_entry(
                    SYSTEM_PROMPT_BACKEND,
                    user_msg,
                    assistant_msg,
                    {"project": project_name, "type": "dao_to_repository", "source": dao_info["name"], "category": "jdbc_dao"}
                ))
                break
    
    return entries

def main():
    all_entries = []
    project_stats = {}
    
    # Découvrir tous les projets
    projects = {}
    for pdir in PROJECTS_DIRS:
        if not os.path.exists(pdir):
            continue
        for item in sorted(os.listdir(pdir)):
            item_path = os.path.join(pdir, item)
            if os.path.isdir(item_path):
                projects[item] = item_path
    
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  Dataset Generator — 19 projets bancaires → JSONL          ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print(f"  Projets trouvés: {len(projects)}")
    print()
    
    for project_name, source_dir in projects.items():
        result_dir = os.path.join(RESULTS_DIR, project_name)
        
        entries = process_project(project_name, source_dir, result_dir)
        all_entries.extend(entries)
        
        # Stats par type
        type_counts = {}
        for e in entries:
            t = e.get("metadata", {}).get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        
        project_stats[project_name] = {
            "total": len(entries),
            "by_type": type_counts
        }
        
        print(f"  [{len(entries):3d}] {project_name}: {type_counts}")
    
    # Écrire le fichier JSONL
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for entry in all_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    
    # Stats globales
    total = len(all_entries)
    by_type = {}
    by_category = {}
    for e in all_entries:
        meta = e.get("metadata", {})
        t = meta.get("type", "unknown")
        c = meta.get("category", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
        by_category[c] = by_category.get(c, 0) + 1
    
    print()
    print(f"  ═══ Résumé ═══════════════════════════════════════════════")
    print(f"  Total entrées: {total}")
    print(f"  Par type:      {by_type}")
    print(f"  Par catégorie: {by_category}")
    print(f"  Fichier:       {OUTPUT_FILE}")
    print(f"  Taille:        {os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB")
    
    # Mettre à jour les stats
    stats_file = os.path.join(os.path.dirname(OUTPUT_FILE), "dataset-stats.json")
    try:
        with open(stats_file, 'r') as f:
            stats = json.load(f)
    except:
        stats = {}
    
    stats["banking_projects"] = {
        "total_entries": total,
        "unique_projects": len(projects),
        "by_type": by_type,
        "by_category": by_category,
        "source": "19 projets bancaires BOA/BMCE Direct (pipeline batch v10.15)"
    }
    
    # Mettre à jour le total global
    existing_total = stats.get("total_entries", 27237)
    stats["total_entries"] = existing_total + total
    stats["by_method"]["rule_based_user_project"] = stats.get("by_method", {}).get("rule_based_user_project", 3) + total
    
    with open(stats_file, 'w') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    
    print(f"  Stats mises à jour: {stats_file}")
    print(f"  Total global dataset: {stats['total_entries']} entrées")

if __name__ == "__main__":
    main()
