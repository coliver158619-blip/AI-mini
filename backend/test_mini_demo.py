from datetime import date, datetime
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, LOCAL_ZONE
from backend.seed_mini_demo import seed


class MiniDemoTest(unittest.TestCase):
    def test_seed_is_account_scoped_repeatable_and_preserves_written_entries(self):
        with tempfile.TemporaryDirectory() as folder, patch('backend.app.now', return_value=datetime(2026, 10, 27, 10, tzinfo=LOCAL_ZONE)):
            database = Path(folder) / 'test.sqlite3'
            app = create_app(dict(TESTING=True, AUTH_ENABLED=True, SEED_DEMO=False, DATABASE=str(database), PET_CHAT_MODE='local'))
            mini, other = app.test_client(), app.test_client()
            login = mini.post('/api/auth/login', json=dict(nickname='mini', gender='male')).json
            other.post('/api/auth/login', json=dict(nickname='other', gender='female'))
            before = other.get('/api/reports').json
            target = database.parent / 'test-rooms' / (login['user']['id'] + '.sqlite3')
            saved = json.dumps(dict(date='2026-09-23', title='保留原文', body='我的真实日记', mood='开心', note='不能覆盖', story={'text':'原来的故事'}))
            with closing(sqlite3.connect(target)) as db, db:
                db.execute('INSERT INTO diary_editions(date,entry) VALUES (?,?)', ('2026-09-23', saved))
            first = seed(database, date(2026, 10, 27))
            self.assertGreater(first['addedPlays'], 1000)
            self.assertTrue(Path(first['backup']).is_file())
            second = seed(database, date(2026, 10, 27))
            self.assertEqual(second['addedPlays'], 0)
            self.assertEqual(second['addedDiaries'], 0)
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(db.execute('SELECT entry FROM diary_editions WHERE date=?', ('2026-09-23',)).fetchone()[0], saved)
                self.assertEqual(db.execute("SELECT count(*) FROM plays WHERE listened_at<'2024-01-01'").fetchone()[0], 0)
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            entries = mini.get('/api/diary').json['entries']
            self.assertEqual(len(entries), 38)
            self.assertEqual(entries[-1]['date'], '2026-09-20')
            self.assertTrue(entries[0]['story']['text'])
            for period in ['year', 'month', 'week']:
                report = mini.get('/api/reports?period=' + period).json
                self.assertGreater(report['summary']['minutes'], 0)
                self.assertTrue(report['isDemo'])
            years = mini.get('/api/reports?period=year').json['trend']
            self.assertEqual([entry['label'] for entry in years], ['2024', '2025', '2026'])
            self.assertTrue(all(entry['minutes'] > 0 for entry in years))
            self.assertEqual(other.get('/api/reports').json, before)


if __name__ == '__main__':
    unittest.main()
