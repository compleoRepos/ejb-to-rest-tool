import json

with open('/tmp/maven-compile-results.json') as f:
    data = json.load(f)

# Focus on bookstore and jdbc-monolith
for p in data:
    name = p['projectName']
    if name not in ['bookstore', 'jdbc-monolith']:
        continue
    
    # Get errors from autoFixResult if available
    errors = []
    if p.get('autoFixResult') and p['autoFixResult'].get('compileResult'):
        cr = p['autoFixResult']['compileResult']
        errors = cr.get('errors', [])
    elif p.get('compileResult'):
        cr = p['compileResult']
        errors = cr.get('errors', [])
    
    print(f"\n{'='*60}")
    print(f"{name}: {len(errors)} errors")
    print(f"{'='*60}")
    
    # Group by file
    by_file = {}
    for e in errors[:50]:  # First 50
        fname = e.get('file', 'unknown')
        if fname not in by_file:
            by_file[fname] = []
        by_file[fname].append(e)
    
    for fname, errs in sorted(by_file.items()):
        print(f"\n  {fname} ({len(errs)} errors):")
        for e in errs[:5]:
            line = e.get('line', '?')
            msg = e.get('message', e.get('error', '?'))
            print(f"    L{line}: {msg}")
        if len(errs) > 5:
            print(f"    ... and {len(errs)-5} more")
