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
    
    # Show unique error messages
    unique_msgs = set()
    for e in errors:
        msg = e.get('message', e.get('error', '?'))
        unique_msgs.add(msg)
    
    print(f"  Unique error messages ({len(unique_msgs)}):")
    for msg in sorted(unique_msgs)[:20]:
        print(f"    {msg}")

    # Show first few errors with full detail
    print(f"\n  First 10 errors with full detail:")
    for e in errors[:10]:
        print(f"    {e}")
