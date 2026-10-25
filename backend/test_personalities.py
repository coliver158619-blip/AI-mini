from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app


class PersonalityTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = str(Path(temporary.name) / 'personality.sqlite3')
        self.config = {'TESTING': True, 'DATABASE': self.path, 'SEED_DEMO': False, 'PET_CHAT_MODE': 'local'}
        self.client = create_app(self.config).test_client()
        # These tests exercise an already unlocked wardrobe; unlock rules have their own suite.
        for outfit in self.client.get('/api/outfits').json['outfits']:
            self.client.post('/api/outfit/unlock', json={'outfitId': outfit['id']})

    def test_catalog_contains_all_16_characters_and_four_groups(self):
        data = self.client.get('/api/personalities').json
        self.assertEqual(data['profile']['personalityId'], 'INFP')
        self.assertEqual(len({item['id'] for item in data['personalities']}), 16)
        for group in data['groups']:
            self.assertEqual(len([item for item in data['personalities'] if item['groupId'] == group['id']]), 4)
        root = Path(__file__).resolve().parent.parent / 'public'
        for item in data['personalities']:
            self.assertTrue((root / item['imageUrl'].lstrip('/')).is_file())
            self.assertTrue(item['musicStyles'] and item['traits'] and item['companionship'])

    def test_selection_persists_independently_of_wardrobe_and_updates_active_image(self):
        self.client.post('/api/profile', json={'name': '保留我的昵称'})
        for item in self.client.get('/api/personalities').json['personalities']:
            result = self.client.post('/api/personality', json={'personalityId': item['id']})
            self.assertEqual(result.status_code, 200)
            profile = result.json['profile']
            self.assertEqual(profile['name'], '保留我的昵称')
            self.assertEqual(profile['appearance']['imageUrl'], item['imageUrl'])
            restarted = create_app(self.config).test_client().get('/api/bootstrap').json['profile']
            self.assertEqual(restarted['personality'], item)
            self.assertEqual(restarted['outfitId'], 'lyn28')
        self.client.post('/api/outfit', json={'outfitId': 'zsh02'})
        self.assertEqual(self.client.get('/api/personalities').json['profile']['personalityId'], item['id'])

    def test_invalid_payloads_never_change_selection(self):
        self.client.post('/api/personality', json={'personalityId': 'ENTJ'})
        for body in (None, [], {}, {'personalityId': []}, {'personalityId': {}}, {'personalityId': True}, {'personalityId': 1}, {'personalityId': 'enfp'}, {'personalityId': 'XXXX'}, {'personalityId': 'ENFPP'}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post('/api/personality', json=body).status_code, 400)
        self.assertEqual(self.client.get('/api/bootstrap').json['profile']['personalityId'], 'ENTJ')

    def test_current_image_follows_saved_selection_and_survives_restart(self):
        response = self.client.get('/api/personality/image')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.json, {'imageName': 'INFP.png'})
        for endpoint, body, id_ in [('/api/personality', {'personalityId': 'ENTP'}, 'ENTP'),
                                     ('/api/outfit', {'outfitId': 'zsh01'}, 'zsh01')]:
            self.assertEqual(self.client.post(endpoint, json=body).status_code, 200)
            restarted = create_app(self.config).test_client()
            image = restarted.get('/api/personality/image').json
            self.assertEqual(image['imageName'], f'{id_}.png')
            self.assertEqual(restarted.get('/api/bootstrap').json['profile']['appearance']['imageName'], image['imageName'])

    def test_outfit_queries_are_read_only_and_images_serve_without_frontend_build(self):
        for outfit in self.client.get('/api/outfits').json['outfits']:
            image = self.client.get('/api/personality/image', query_string={'outfitId': outfit['id']})
            self.assertEqual(image.json, {'imageName': outfit['imageName']})
            response = self.client.get(outfit['imageUrl'])
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, 'image/webp')
            response.close()
        for query in ('outfitId=', 'outfitId=INFP', 'outfitId=zsh01&outfitId=lyn22', 'outfitId=zsh01&personalityId=INFP'):
            self.assertEqual(self.client.get('/api/personality/image?' + query).status_code, 400)
        self.assertEqual(self.client.get('/api/personality/image').json, {'imageName': 'INFP.png'})

    def test_query_any_personality_image_without_changing_current_selection(self):
        self.client.post('/api/personality', json={'personalityId': 'ENTJ'})
        for item in self.client.get('/api/personalities').json['personalities']:
            response = self.client.get('/api/personality/image', query_string={'personalityId': item['id']})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {'imageName': item['imageName']})
        self.assertEqual(self.client.get('/api/personality/image').json['imageName'], 'ENTJ.png')

    def test_invalid_image_queries_return_400_without_changing_selection(self):
        for query in ('personalityId=', 'personalityId=enfp', 'personalityId=XXXX', 'personalityId=ENFPP',
                      'personalityId=../INFP.png', 'personalityId=INFP&personalityId=ENFP'):
            with self.subTest(query=query):
                response = self.client.get(f'/api/personality/image?{query}')
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.json['error'], str)
        self.assertEqual(self.client.get('/api/personality/image').json['imageName'], 'INFP.png')

    def test_h5_catalog_images_remain_available_and_revalidate_cache(self):
        for item in self.client.get('/api/personalities').json['personalities']:
            image = self.client.get('/api/personality/image', query_string={'personalityId': item['id']}).json
            response = self.client.get(item['imageUrl'])
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, 'image/webp')
            self.assertEqual(image['imageName'], item['imageName'])
            self.assertEqual(response.data, (Path(__file__).resolve().parent.parent / 'public' / item['imageUrl'].lstrip('/')).read_bytes())
            cached = self.client.get(item['imageUrl'], headers={'If-None-Match': response.headers['ETag']})
            self.assertEqual(cached.status_code, 304)
            cached.close()
            response.close()

    def test_personality_image_does_not_require_frontend_build_or_fall_back_to_html(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / 'public' / 'assets' / 'personalities'
            assets.mkdir(parents=True)
            (assets / 'INFP.png').write_bytes((Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'personalities' / 'INFP.png').read_bytes())
            with patch('backend.app.ROOT', root):
                response = self.client.get('/assets/personalities/INFP.png')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.mimetype, 'image/png')
                response.close()
                for name in ('unknown.png', 'infp.png', 'INFP.jpg', 'nested/INFP.png', '../INFP.png'):
                    with self.subTest(name=name):
                        invalid = self.client.get(f'/assets/personalities/{name}')
                        self.assertEqual(invalid.status_code, 404)
                        self.assertIsInstance(invalid.json['error'], str)

    def test_legacy_outfit_migrates_once_and_keeps_other_data(self):
        self.client.post('/api/profile', json={'name': '原有昵称'})
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE app_meta SET value='ENTJ' WHERE key='outfit_id'")
            db.execute("DELETE FROM app_meta WHERE key IN ('personality_id','appearance_mode')")
            previous = db.execute('SELECT * FROM profile').fetchall()
        client = create_app(self.config).test_client()
        self.assertEqual(client.get('/api/bootstrap').json['profile']['personalityId'], 'ENTJ')
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT * FROM profile').fetchall(), previous)
            self.assertEqual(db.execute("SELECT value FROM app_meta WHERE key='outfit_id'").fetchone()[0], 'lyn28')
        client.post('/api/personality', json={'personalityId': 'ESFP'})
        self.assertEqual(create_app(self.config).test_client().get('/api/bootstrap').json['profile']['personalityId'], 'ESFP')


if __name__ == '__main__':
    unittest.main()
