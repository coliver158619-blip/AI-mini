"""Wardrobe persistence, validation, and upgrading an existing database."""
from pathlib import Path
import hashlib
import sqlite3
import tempfile
import unittest

from backend.app import create_app, now
from backend.outfits import OUTFITS, DEFAULT_OUTFIT_ID


class OutfitTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "wardrobe.sqlite3")
        self.config = {"TESTING": True, "DATABASE": self.path, "SEED_DEMO": False, "PET_CHAT_MODE": "local"}
        self.client = create_app(self.config).test_client()
        # These tests exercise an already unlocked wardrobe; unlock rules have their own suite.
        for outfit in self.client.get('/api/outfits').json['outfits']:
            self.client.post('/api/outfit/unlock', json={'outfitId': outfit['id']})

    def test_catalog_default_and_assets(self):
        result = self.client.get('/api/outfits')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['profile']['outfitId'], 'lyn28')
        self.assertEqual(len(result.json['outfits']), 31)
        self.assertEqual([item['name'] for item in result.json['characters']], ['KUGUY', 'KUGIRL'])
        self.assertEqual(result.json['profile']['appearanceMode'], 'personality')
        root = Path(__file__).resolve().parent.parent / 'public'
        image_hashes = set()
        for outfit in result.json['outfits']:
            for field in ('thumbnailUrl', 'imageUrl'):
                self.assertTrue((root / outfit[field].lstrip('/')).is_file(), outfit[field])
            image_hash = hashlib.sha256((root / outfit['imageUrl'].lstrip('/')).read_bytes()).digest()
            self.assertNotIn(image_hash, image_hashes, outfit['id'])
            image_hashes.add(image_hash)

    def test_equip_all_outfits_and_restore_original_across_restarts(self):
        self.client.post('/api/profile', json={'name': '小蓝'})
        before = self.client.get('/api/bootstrap').json['profile']
        for outfit in [*OUTFITS, next(item for item in OUTFITS if item["id"] == DEFAULT_OUTFIT_ID)]:
            with self.subTest(outfit=outfit['id']):
                result = self.client.post('/api/outfit', json={'outfitId': outfit['id']})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json['profile']['outfit'], outfit)
                self.client = create_app(self.config).test_client()
                restored = self.client.get('/api/bootstrap').json['profile']
                self.assertEqual(restored['outfitId'], outfit['id'])
                self.assertEqual(restored['personalityId'], before['personalityId'])
                self.assertEqual(restored['appearanceMode'], 'outfit')
                self.assertEqual(restored['appearance']['imageName'], outfit['imageName'])
                self.assertEqual(self.client.get('/api/personality/image').json, {'imageName': outfit['imageName']})
                self.assertEqual(restored['outfit']['imageUrl'], outfit['imageUrl'])
                for key in ('name', 'energy', 'days', 'streak'):
                    self.assertEqual(restored[key], before[key])
        self.assertEqual(self.client.post('/api/feed', json={}).json['profile']['outfitId'], 'lyn28')

    def test_two_saved_appearances_and_each_character_survive_switches_and_restart(self):
        self.client.post('/api/personality', json={'personalityId': 'ENTJ'})
        self.client.post('/api/outfit', json={'outfitId': 'lyn26'})
        self.client.post('/api/outfit', json={'outfitId': 'zsh08'})
        result = self.client.post('/api/personality', json={'personalityId': 'ENTJ'}).json['profile']
        self.assertEqual(result['outfitId'], 'zsh08')
        self.assertEqual(result['appearance']['imageName'], 'ENTJ.png')
        self.client = create_app(self.config).test_client()
        result = self.client.get('/api/outfits').json['profile']
        self.assertEqual(result['characterOutfitIds'], {'lyn': 'lyn26', 'zsh': 'zsh08'})
        self.client.post('/api/outfit', json={'outfitId': result['outfitId']})
        self.assertEqual(self.client.get('/api/personality/image').json, {'imageName': 'zsh08.png'})
        self.assertEqual(self.client.get('/api/personalities').json['profile']['personalityId'], 'ENTJ')

    def test_invalid_selection_never_changes_worn_outfit(self):
        self.client.post('/api/outfit', json={'outfitId': 'lyn23'})
        for body in ({}, None, [], {'outfitId': None}, {'outfitId': False}, {'outfitId': 2}, {'outfitId': []}, {'outfitId': {}}, {'outfitId': ''}, {'outfitId': 'x'*41}, {'outfitId': '../companion.png'}, {'outfitId': 'missing'}):
            with self.subTest(body=body):
                response = self.client.post('/api/outfit', json=body)
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.json['error'], str)
        self.assertEqual(self.client.post('/api/outfit', data='{', content_type='application/json').status_code, 400)
        self.assertEqual(self.client.get('/api/outfits').json['profile']['outfitId'], 'lyn23')

    def test_existing_database_is_upgraded_without_resetting_other_data(self):
        self.client.post('/api/profile', json={'name': '原来的名字'})
        self.assertEqual(self.client.put(f'/api/diary/{now().date().isoformat()}', json={'note': '换装前的心情'}).status_code, 200)
        self.client.post('/api/favorites', json={'songId': 'sunny-window', 'favorite': True})
        with sqlite3.connect(self.path) as db:
            db.execute("DELETE FROM app_meta WHERE key='outfit_id'")
            before_profile = db.execute('SELECT * FROM profile').fetchall()
            before_notes = db.execute('SELECT * FROM diary_notes').fetchall()
            before_favorites = db.execute('SELECT * FROM favorites').fetchall()
        client = create_app(self.config).test_client()
        self.assertEqual(client.get('/api/bootstrap').json['profile']['outfitId'], 'lyn28')
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT * FROM profile').fetchall(), before_profile)
            self.assertEqual(db.execute('SELECT * FROM diary_notes').fetchall(), before_notes)
            self.assertEqual(db.execute('SELECT * FROM favorites').fetchall(), before_favorites)
        client.post('/api/outfit', json={'outfitId': 'zsh01'})
        client.post('/api/profile', json={'name': '新的名字'})
        self.assertEqual(create_app(self.config).test_client().get('/api/outfits').json['profile']['outfitId'], 'zsh01')

    def test_unknown_stored_id_falls_back_and_can_be_replaced(self):
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE app_meta SET value='retired-outfit' WHERE key='outfit_id'")
        self.assertEqual(self.client.get('/api/bootstrap').json['profile']['outfitId'], 'lyn28')
        self.assertEqual(self.client.post('/api/outfit', json={'outfitId': 'zsh02'}).json['profile']['outfitId'], 'zsh02')


if __name__ == '__main__':
    unittest.main()
