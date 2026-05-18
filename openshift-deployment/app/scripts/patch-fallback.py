#!/usr/bin/env python3
"""Patch BusinessLogicMigrator.ts to use EnhancedFallbackMigrator."""
import re

filepath = "/home/ubuntu/ejb-client-modernizer/server/engine/llm/BusinessLogicMigrator.ts"

with open(filepath, "r") as f:
    content = f.read()

# 1. Add import for EnhancedFallbackMigrator after the existing import block
old_import = 'from "../ml/llm-adapter";'
new_import = 'from "../ml/llm-adapter";\nimport { buildEnhancedFallback } from "./EnhancedFallbackMigrator";'
content = content.replace(old_import, new_import, 1)

# 2. Replace the buildFallbackResult method body
# Find the method start and end
start_marker = "  private buildFallbackResult("
end_marker_pattern = r"(      success: false,\n    \};\n  \})"

# Find start position
start_idx = content.find(start_marker)
if start_idx == -1:
    print("ERROR: Could not find buildFallbackResult method")
    exit(1)

# Find the docstring before it
doc_start = content.rfind("  /**", 0, start_idx)

# Find end: look for the closing "  }" after "success: false"
search_from = start_idx
success_false_idx = content.find("success: false,", search_from)
if success_false_idx == -1:
    print("ERROR: Could not find success: false")
    exit(1)

# Find the closing "  }" after success: false
close_idx = content.find("  }", success_false_idx)
if close_idx == -1:
    print("ERROR: Could not find closing brace")
    exit(1)

# The end is after "  }"
end_idx = close_idx + len("  }")

# Replace the entire method (including docstring)
replacement = """  /**
   * Fallback quand le LLM est indisponible :
   * Utilise le EnhancedFallbackMigrator v10.15 pour générer du code
   * Spring Data JPA plus complet et fidèle à la logique métier.
   */
  private buildFallbackResult(
    ctx: JdbcMigrationContext,
    warnings: string[],
  ): JdbcMigrationResult {
    const result = buildEnhancedFallback(ctx);
    result.warnings = [...warnings, ...result.warnings];
    return result;
  }"""

content = content[:doc_start] + replacement + content[end_idx:]

with open(filepath, "w") as f:
    f.write(content)

print(f"SUCCESS: Patched buildFallbackResult (replaced {end_idx - doc_start} chars)")
