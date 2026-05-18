import json

data = json.load(open('/tmp/maven-compile-results.json'))
pass_count = 0
fail_count = 0
for p in data:
    final = p.get('autoFixResult', {}).get('finalResult', p.get('compileResult', {}))
    status = final.get('status', 'UNKNOWN')
    is_pass = status == 'PASS'
    if is_pass:
        pass_count += 1
    else:
        fail_count += 1
    errors = final.get('errorCount', len(final.get('errors', [])))
    print(f"  {p['projectName']:25s} {'PASS' if is_pass else 'FAIL'} (errors: {errors})")

print(f"\n=== TOTAL: {pass_count} PASS / {fail_count} FAIL ===")
print(f"Taux: {pass_count}/10 ({pass_count*10}%)")
