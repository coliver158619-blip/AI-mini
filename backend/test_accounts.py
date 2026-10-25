import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.app import create_app
from backend.outfits import OUTFITS
from backend.personalities import PERSONALITIES


class AccountsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'test.sqlite3'
        self.app = create_app(dict(TESTING=True, AUTH_ENABLED=True, DATABASE=str(self.path), SEED_DEMO=False, PET_CHAT_MODE='local'))
        self.a, self.b = self.app.test_client(), self.app.test_client()

    def login(self, client, name='小蓝', gender='male'):
        response = client.post('/api/auth/login', json=dict(nickname=name, gender=gender))
        self.assertEqual(response.status_code, 200, response.json)
        return response.json

    def test_session_and_device_reentry(self):
        self.assertEqual(self.a.get('/api/bootstrap').status_code, 401)
        self.assertIsNone(self.a.get('/api/auth/session').json['user'])
        first = self.login(self.a)
        self.assertFalse(first['user']['onboardingComplete'])
        self.assertEqual(self.a.post('/api/auth/complete').status_code, 200)
        self.assertIsNone(self.b.get('/api/auth/session').json['user'])
        second = self.login(self.b, gender=None)
        self.assertFalse(second['isNew'])
        self.assertTrue(second['user']['onboardingComplete'])
        self.assertEqual(first['profile'], second['profile'])
        self.a.post('/api/auth/logout')
        self.assertEqual(self.a.get('/api/bootstrap').status_code, 401)
        self.assertEqual(self.b.get('/api/bootstrap').status_code, 200)

    def test_initial_six_and_unlock_isolation(self):
        self.login(self.a)
        self.login(self.b, '小粉', 'female')
        free = {item['id'] for item in OUTFITS if item['unlockMethod'] == 'free'}
        self.assertEqual(len(free), 6)
        locked = next(item['id'] for item in OUTFITS if item['id'] not in free)
        for client in (self.a, self.b):
            catalog = client.get('/api/outfits').json
            self.assertEqual({item['id'] for item in catalog['outfits'] if item['unlocked']}, free)
        result = self.a.post('/api/outfit/unlock', json={'outfitId':locked})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.a.post('/api/outfit', json={'outfitId':locked}).status_code, 200)
        self.assertEqual(self.b.post('/api/outfit', json={'outfitId':locked}).status_code, 403)
        self.login(self.b, '小蓝')
        self.assertEqual(self.b.get('/api/outfits').json['profile']['outfitId'], locked)

    def test_pool_and_gender_for_every_possible_selection(self):
        self.assertEqual(len(PERSONALITIES), 16)
        for gender, character in [('male', 'lyn'), ('female', 'zsh')]:
            pool = [('personality', p) for p in PERSONALITIES if p['gender'] == gender]
            pool += [('outfit', o) for o in OUTFITS if o['characterId'] == character and o['unlockMethod'] == 'free']
            self.assertEqual(len(pool), 11)
            for index, choice in enumerate(pool):
                with patch('backend.accounts.secrets.choice', side_effect=lambda options, chosen=choice: chosen if chosen in options else self.fail('wrong random pool')):
                    result = self.login(self.a, f'{gender}{index}', gender)
                self.assertEqual(result['profile']['appearanceMode'], choice[0])
                self.assertEqual(result['profile']['appearance']['id'], choice[1]['id'])
                self.assertEqual(result['profile']['energy'], 0)
        pairs = {p['pairId'] for p in PERSONALITIES}
        self.assertEqual(len(pairs), 8)
        for pair in pairs:
            self.assertEqual({p['gender'] for p in PERSONALITIES if p['pairId'] == pair}, {'male', 'female'})

    def test_favorites_and_stale_tab_writes_are_isolated(self):
        first = self.login(self.a)
        song = self.a.get('/api/bootstrap').json['songs'][0]['id']
        self.assertEqual(self.a.post('/api/favorites', json={'songId':song}).status_code, 200)
        self.login(self.b, '另一个人', 'female')
        self.assertFalse(any(s['favorite'] for s in self.b.get('/api/bootstrap').json['songs']))
        self.assertEqual(self.b.post('/api/favorites', json={'songId':song}, headers={'X-Music-User':first['user']['id']}).status_code, 409)
        self.assertEqual(self.b.post('/api/play', json={'songId':song, 'seconds':10, '_accountId':first['user']['id']}).status_code, 409)
        self.assertEqual(self.b.get('/api/bootstrap', headers={'X-Music-User':first['user']['id']}).status_code, 409)

    def test_nickname_rename_and_duplicate(self):
        self.login(self.a)
        self.login(self.b, '小粉', 'female')
        self.assertEqual(self.a.post('/api/profile', json={'name':'小粉'}).status_code, 400)
        self.assertEqual(self.a.get('/api/bootstrap').json['profile']['name'], '小蓝')
        self.assertEqual(self.a.post('/api/profile', json={'name':'小紫'}).status_code, 200)
        result = self.login(self.b, '小紫', None)
        self.assertFalse(result['isNew'])
        self.assertEqual(result['profile']['name'], '小紫')

    def test_shared_diary_and_chat_belong_to_one_nickname(self):
        self.login(self.a)
        self.login(self.b, '小粉', 'female')
        today = self.a.get('/api/shared-diary').json['today']
        response = self.a.put('/api/shared-diary/' + today, json={'revision':0, 'note':'今天一起散步', 'body':'我们听着歌走过河边。'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.b.get('/api/shared-diary').json['entries'][0]['note'], '')
        self.assertEqual(self.a.post('/api/chat', json={'message':'我今天做了草莓蛋糕'}).status_code, 200)
        self.assertNotIn('草莓蛋糕', str(self.b.get('/api/messages').json))
        self.login(self.b, '小蓝', None)
        self.assertEqual(self.b.get('/api/shared-diary').json['entries'][0]['note'], '今天一起散步')
        self.assertIn('草莓蛋糕', str(self.b.get('/api/messages').json))

    def test_validation_origin_and_expiry(self):
        self.assertEqual(self.a.post('/api/auth/login', json={'nickname':'新朋友'}).status_code, 400)
        self.assertEqual(self.a.post('/api/auth/login', json={'nickname':'\n', 'gender':'male'}).status_code, 400)
        self.assertEqual(self.a.post('/api/auth/login', json={'nickname':'小蓝', 'gender':'male'}, headers={'Origin':'https://elsewhere.invalid'}).status_code, 403)
        self.login(self.a)
        with sqlite3.connect(self.path.parent / 'test-rooms/accounts.sqlite3') as db:
            db.execute('UPDATE sessions SET expires_at=0')
        self.assertEqual(self.a.get('/api/bootstrap').status_code, 401)
        self.assertIsNone(self.a.get('/api/auth/session').json['user'])


if __name__ == '__main__':
    unittest.main()
