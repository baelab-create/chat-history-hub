"""Read named task metadata only. Never opens rollouts or conversation bodies."""
import json, os, sqlite3
from pathlib import Path
root=Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))
files=list(root.glob('state_*.sqlite'))
if not files: raise RuntimeError('Local task database not found')
path=max(files,key=lambda p:int(p.stem.split('_')[-1]))
connection=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=10)
connection.execute('PRAGMA query_only=ON')
required={'id','name','updated_at','archived','source'}
if not required.issubset({r[1] for r in connection.execute('PRAGMA table_info(threads)')}):
 raise RuntimeError('Unsupported local metadata schema; existing snapshot retained')
rows=connection.execute("SELECT id,name,updated_at,archived FROM threads WHERE source IN ('cli','vscode','exec','appServer','unknown') AND name IS NOT NULL AND trim(name) != ''").fetchall()
print(json.dumps([{'id':r[0],'kind':'codex','title':r[1],'updatedAt':r[2],'archived':bool(r[3])} for r in rows],ensure_ascii=False))
