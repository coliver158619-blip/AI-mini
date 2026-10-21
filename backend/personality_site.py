"""Retry saved character selections to the public, read-only Sites API."""
import json
import sqlite3
import threading
from .appearance import appearance_state
from urllib.request import Request, urlopen


class PersonalitySiteSync:
    def __init__(self, app):
        self.app = app
        self.url = app.config.get('PERSONALITY_SITE_URL', '').rstrip('/')
        self.token = app.config.get('PERSONALITY_SITE_SYNC_TOKEN', '')
        self.enabled = bool(self.url and self.token)
        if self.enabled and not self.url.startswith('https://'):
            raise ValueError('PERSONALITY_SITE_URL 需为 HTTPS 地址')
        self.pending = threading.Event()
        self.lock = threading.Lock()
        self.last_revision = None

    def start(self):
        if self.enabled:
            self.wake()
            threading.Thread(target=self._run, name='personality-site-sync', daemon=True).start()

    def wake(self):
        if self.enabled:
            self.pending.set()

    def _run(self):
        while True:
            self.pending.wait(15)
            self.pending.clear()
            try:
                self.sync_once()
            except Exception as error:
                # Neither the authorization header nor upstream error bodies go to logs.
                self.app.logger.warning('Personality Site sync deferred (%s)', type(error).__name__)

    def sync_once(self):
        if not self.enabled:
            return False
        with self.lock:
            with sqlite3.connect(self.app.config['DATABASE'], timeout=10) as db:
                profile, revision = appearance_state(db)
                id_ = profile['appearance']['id']
            if revision == self.last_revision:
                return True
            body = {'personalityId': id_, 'revision': revision}
            request = Request(self.url + '/api/personality/image', data=json.dumps(body).encode(),
                              headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token,
                                       'User-Agent': 'AI-mini-Personality/1.0'},
                              method='PUT')
            with urlopen(request, timeout=5) as response:
                result = json.load(response)
            if result.get('synced') is not True or result.get('revision') != revision:
                raise ValueError('Invalid synchronization acknowledgement')
            self.last_revision = revision
            return True
