from pathlib import Path
import tempfile
import unittest

from backend.app import create_app
from backend.rankings import STARS


class RankingsTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.config = dict(TESTING=True, DATABASE=str(Path(folder.name) / 'rankings.sqlite3'), SEED_DEMO=False, PET_CHAT_MODE='local')
        self.client = create_app(self.config).test_client()

    def test_star_top_1000_pagination_and_viewer_match_personal_score(self):
        before = self.client.get('/api/bootstrap').json['profile']
        personal = self.client.get('/api/rankings/personal').json['entries']
        board = self.client.get('/api/rankings/star?starId=lyn&limit=100').json
        self.assertTrue(board['isDemo'])
        self.assertEqual(board['total'], 1000)
        self.assertEqual(board['participantCount'], 1200)
        self.assertEqual(board['viewer']['intimacy'], personal[0]['intimacy'])
        rows = []
        for offset in range(0, 1000, 100):
            result = self.client.get(f'/api/rankings/star?starId=lyn&offset={offset}&limit=100').json
            self.assertEqual(result['nextOffset'], offset + 100 if offset < 900 else None)
            rows.extend(result['entries'])
        self.assertEqual([row['rank'] for row in rows], list(range(1, 1001)))
        self.assertEqual(len({row['userId'] for row in rows}), 1000)
        self.assertEqual([r['intimacy'] for r in rows], sorted([r['intimacy'] for r in rows], reverse=True))
        mine = next(row for row in rows if row['isMe'])
        self.assertEqual(mine['rank'], board['viewer']['rank'])
        self.assertEqual(self.client.get('/api/rankings/star?offset=1000').json['entries'], [])
        self.assertEqual(self.client.get('/api/bootstrap').json['profile'], before)

    def test_personal_top_100_and_search_keep_global_ranks_including_outside_board(self):
        result = self.client.get('/api/rankings/personal').json
        self.assertEqual(result['total'], 100)
        self.assertEqual(result['availableStars'], 128)
        entries = result['entries']
        self.assertEqual([r['rank'] for r in entries], list(range(1, 101)))
        self.assertEqual([r['intimacy'] for r in entries], sorted([r['intimacy'] for r in entries], reverse=True))
        target = entries[84]
        hit = self.client.get('/api/rankings/personal/search', query_string={'q': target['star']['name']}).json['matches'][0]
        self.assertEqual(hit, target)
        outside = next(star for star in STARS if star['id'] not in {row['star']['id'] for row in entries})
        hit = self.client.get('/api/rankings/personal/search', query_string={'q': outside['name']}).json['matches'][0]
        self.assertGreater(hit['rank'], 100)
        self.assertFalse(hit['inTop100'])
        self.assertEqual(self.client.get('/api/rankings/personal').json['entries'], entries)
        self.assertEqual(self.client.get('/api/rankings/personal/search?q=').json['matches'], [])

    def test_search_catalog_aliases_empty_and_images(self):
        for text, name in [(' 刘宇宁 ', '刘宇宁'), ('ZSH', '张韶涵'), ('jay', '周杰伦')]:
            matches = self.client.get('/api/rankings/stars', query_string={'q': text}).json['stars']
            self.assertEqual(matches[0]['name'], name)
        self.assertEqual(self.client.get('/api/rankings/stars?q=不存在的明星').json['stars'], [])
        self.assertEqual(len(self.client.get('/api/rankings/stars').json['stars']), 128)
        for star in STARS:
            if star['imageUrl']:
                self.assertTrue((Path(__file__).resolve().parent.parent / 'public' / star['imageUrl'].lstrip('/')).is_file())

    def test_invalid_requests_and_restart_are_stable(self):
        for query in ['starId=missing', 'offset=-1', 'offset=1001', 'offset=abc', 'limit=0', 'limit=101', 'limit=1.5', 'starId=lyn&starId=zsh', 'limit=10&limit=20']:
            self.assertEqual(self.client.get('/api/rankings/star?' + query).status_code, 400, query)
        for path in ['/api/rankings/stars?q=lyn&q=zsh', '/api/rankings/personal/search?q=' + 'a' * 41]:
            self.assertEqual(self.client.get(path).status_code, 400)
        before = self.client.get('/api/rankings/star?starId=zsh').json
        after = create_app(self.config).test_client().get('/api/rankings/star?starId=zsh').json
        self.assertEqual(after, before)

    def test_auth_required_and_personal_scores_are_room_scoped(self):
        app = create_app({**self.config, 'AUTH_ENABLED': True})
        one, two = app.test_client(), app.test_client()
        self.assertEqual(one.get('/api/rankings/star').status_code, 401)
        one.post('/api/auth/login', json={'nickname': '榜单测试甲', 'gender': 'male'})
        two.post('/api/auth/login', json={'nickname': '榜单测试乙', 'gender': 'female'})
        a = one.get('/api/rankings/personal').json['entries']
        b = two.get('/api/rankings/personal').json['entries']
        self.assertNotEqual(a, b)
        self.assertEqual(one.get('/api/rankings/personal').json['entries'], a)
