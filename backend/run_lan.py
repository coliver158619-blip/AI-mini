"""Run the LAN service independently of a terminal session.

Optional local runtime settings live in ignored backend/data/lan-service.json.
They are never sent to the browser or written to service logs.
"""
import json
import os
from pathlib import Path

from .app import create_app


def main():
    settings = Path(__file__).resolve().parent / 'data' / 'lan-service.json'
    if settings.exists():
        if settings.stat().st_mode & 0o077:
            raise RuntimeError('LAN runtime settings must have permissions 0600')
        values = json.loads(settings.read_text())
        for key in ('PERSONALITY_SITE_URL', 'PERSONALITY_SITE_SYNC_TOKEN'):
            if key in values:
                os.environ.setdefault(key, values[key])
    create_app().run(host=os.getenv('HOST', '0.0.0.0'), port=int(os.getenv('PORT', '5000')),
                     debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
