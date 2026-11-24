"""Serve the desktop regression fixture until the parent process closes stdin."""
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.provider import Provider
from server import create_server


def main():
    with TemporaryDirectory(prefix='huiwu-desktop-test-') as directory:
        with create_server(port=0, db=Path(directory) / 'fixture.sqlite3',
                           provider=Provider(env={}), static_root=ROOT / 'static') as server:
            thread = Thread(target=server.serve_forever)
            thread.start()
            try:
                print(server.server_port, flush=True)
                sys.stdin.buffer.read()
            finally:
                server.shutdown()
                thread.join()


if __name__ == '__main__':
    main()
