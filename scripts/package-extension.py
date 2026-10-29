"""Build/verify a complete unpacked extension, with deterministic ZIP metadata."""
import io
import json
import pathlib
import re
import sys
import zipfile
root = pathlib.Path(__file__).resolve().parent.parent
source = root / 'extension'
manifest = json.loads((source / 'manifest.json').read_text())
version = manifest['version']
assert re.fullmatch(r'\d+\.\d+\.\d+', version)
files = {p.relative_to(source).as_posix(): p.read_bytes() for p in sorted(source.rglob('*'))
         if p.is_file() and p.suffix in {'.js', '.json', '.html', '.txt', '.png'}}
# Fail packaging before publication if any declared entry point or local import is missing.
references = [manifest['background']['service_worker'], manifest['action']['default_popup'], 'INSTALL-KO.txt']
references += list(manifest['icons'].values()) + list(manifest['action']['default_icon'].values())
for entry in manifest['content_scripts']:
    references += entry.get('js', []) + entry.get('css', [])
for name, data in files.items():
    if name.endswith('.js'):
        for target in re.findall(r"^import\s+.*?from\s+['\"](\.[^'\"]+)['\"]", data.decode(), re.M):
            resolved = (source / pathlib.PurePosixPath(name).parent / target).resolve()
            references.append(resolved.relative_to(source.resolve()).as_posix())
    if name.endswith('.html'):
        for target in re.findall(r'(?:src|href)=[\'"]([^\'"]+)[\'"]', data.decode()):
            if ':' not in target and not target.startswith('#'):
                references.append((pathlib.PurePosixPath(name).parent / target).as_posix())
assert all(name in files for name in references), 'Missing extension dependency: ' + ', '.join(n for n in references if n not in files)
for size, name in manifest['icons'].items():
    data = files[name]
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert int.from_bytes(data[16:20], 'big') == int(size) == int.from_bytes(data[20:24], 'big')
assert version in files['INSTALL-KO.txt'].decode() and version in files['popup.html'].decode()
payload = io.BytesIO()
with zipfile.ZipFile(payload, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        info = zipfile.ZipInfo('chat-history-browser-extension/' + name, (2026, 10, 30, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, data)
targets = [root / 'setup/chat-history-browser-extension.zip', root / f'setup/chat-history-hub-{version}.zip']
for target in targets:
    if '--check' in sys.argv:
        with zipfile.ZipFile(target) as actual, zipfile.ZipFile(payload) as expected:
            assert actual.namelist() == expected.namelist(), 'Extension ZIP has different files; rebuild it'
            for name in expected.namelist():
                assert actual.read(name) == expected.read(name), f'Stale extension ZIP member: {name}'
    else:
        target.write_bytes(payload.getvalue())
print(f'Complete extension {version}: {len(files)} files; ' + ('packages verified' if '--check' in sys.argv else 'packages rebuilt'))
