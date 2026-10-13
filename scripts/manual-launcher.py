"""Invoked by pythonw.exe only on a deliberate website click. No UI or scheduler."""
import re
import subprocess
import sys
from pathlib import Path

def main(args):
    if len(args) != 1 or not re.fullmatch(r'chathistoryhub://sync/[a-f0-9]{64}/?', args[0]):
        return
    root = Path(__file__).resolve().parent.parent
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    subprocess.Popen(
        [str(root / 'runtime' / 'node.exe'), str(root / 'collector' / 'manual-server.mjs'), args[0]],
        cwd=root, shell=False, creationflags=subprocess.CREATE_NO_WINDOW,
        startupinfo=startup, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, close_fds=True,
    )

if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        pass  # Website reports a bounded connection failure; no desktop popup.
