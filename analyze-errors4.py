import json

with open('/tmp/maven-compile-results.json') as f:
    data = json.load(f)

results = data if isinstance(data, list) else data.get('results', [])

for r in results:
    name = r.get('projectName', '?')
    if name not in ('bookstore', 'jdbc-monolith', 'monolith'):
        continue
    errors = r.get('compileResult', {}).get('errors', [])
    error_count = r.get('compileResult', {}).get('errorCount', 0)
    print(f"\n{'='*60}")
    print(f"{name} ({error_count} errors)")
    print(f"{'='*60}")
    
    # Group by file
    by_file = {}
    for e in errors[:50]:
        f_name = e.get('file', '?').split('/')[-1]
        msg = e.get('message', '?')
        line = e.get('line', '?')
        if f_name not in by_file:
            by_file[f_name] = []
        by_file[f_name].append(f"  L{line}: {msg[:80]}")
    
    for f_name, errs in sorted(by_file.items()):
        print(f"\n  {f_name} ({len(errs)} errors):")
        for e in errs[:5]:
            print(f"    {e}")
        if len(errs) > 5:
            print(f"    ... and {len(errs)-5} more")
