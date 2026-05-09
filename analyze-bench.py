import json

with open('/tmp/maven-compile-results.json') as f:
    data = json.load(f)

pass_count = 0
total = len(data)

for p in data:
    errors = p['compileResult'].get('errorCount', 0) if p.get('compileResult') else 0
    # Check autoFixResult too
    if p.get('autoFixResult') and p['autoFixResult'].get('compileResult'):
        errors = p['autoFixResult']['compileResult'].get('errorCount', 0)
    
    is_pass = errors == 0
    if is_pass:
        pass_count += 1
    status = 'PASS' if is_pass else 'FAIL'
    print(f"  {p['projectName']}: {status} ({errors} errors)")

print(f"\nScore: {pass_count}/{total} PASS ({pass_count*100//total}%)")
