import json

with open("/tmp/gen-result.json") as f:
    d = json.load(f)

print(f"Total files: {len(d.get('files', []))}")
print(f"Total lines: {sum(f.get('lineCount', 0) for f in d.get('files', []))}")
print()

for file in d.get('files', []):
    if 'BIAN' in file.get('path', ''):
        print(f"=== {file['path']} ===")
        print(file.get('content', 'NO CONTENT')[:3000])
        print()

# Also check Controller for proper params
for file in d.get('files', []):
    if 'CreditController' in file.get('path', '') and 'Test' not in file.get('path', ''):
        print(f"\n=== {file['path']} (first 80 lines) ===")
        lines = file.get('content', '').split('\n')[:80]
        print('\n'.join(lines))
