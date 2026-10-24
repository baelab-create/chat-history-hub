"""Build or verify the exact reviewed extension ZIP, with deterministic metadata."""
import io
import pathlib
import sys
import zipfile
root = pathlib.Path(__file__).resolve().parent.parent
payload = io.BytesIO()
with zipfile.ZipFile(payload, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / 'extension').iterdir()):
        if path.is_file() and path.suffix in {'.js', '.json', '.html'}:
            info = zipfile.ZipInfo('chat-history-browser-extension/' + path.name, (2026, 10, 24, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
target = root / 'setup/chat-history-browser-extension.zip'
if '--check' in sys.argv:
    # Compare member bytes rather than zlib-dependent compressed output.
    with zipfile.ZipFile(target) as actual, zipfile.ZipFile(payload) as expected:
        assert actual.namelist() == expected.namelist(), 'Extension ZIP has different files; rebuild it'
        for name in expected.namelist():
            assert actual.read(name) == expected.read(name), f'Stale extension ZIP member: {name}'
    print('Extension package matches source')
else:
    target.write_bytes(payload.getvalue())
    print('Extension package rebuilt')
