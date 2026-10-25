from pathlib import Path
import sqlite3
import tempfile
import unittest

from backend.app import create_app


class WardrobeUnlockTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = str(Path(temporary.name) / 'unlocks.sqlite3')
        self.config = dict(TESTING=True, DATABASE=self.path, SEED_DEMO=False, PET_CHAT_MODE='local')
        self.client = create_app(self.config).test_client()

    def test_only_six_base_outfits_are_free_and_locked_equipping_is_rejected(self):
        catalog = self.client.get('/api/outfits').json
        self.assertEqual({item['id'] for item in catalog['outfits'] if item['unlocked']},
                         {'lyn28', 'lyn31', 'lyn33', 'zsh09', 'zsh12', 'zsh15'})
        before = self.client.get('/api/widget/appearance').json
        for outfit in catalog['outfits']:
            if not outfit['unlocked']:
                result = self.client.post('/api/outfit', json={'outfitId': outfit['id']})
                self.assertEqual(result.status_code, 403)
                self.assertEqual(result.json['code'], 'OUTFIT_LOCKED')
        self.assertEqual(self.client.get('/api/widget/appearance').json, before)
        self.assertEqual(catalog['profile']['outfitId'], 'lyn28')

    def test_energy_and_album_unlocks_are_idempotent_persist_without_spending_or_equipping(self):
        before = self.client.get('/api/bootstrap').json['profile']
        widget_before = self.client.get('/api/widget/appearance').json
        for id_, method, message in [('lyn29', 'energy', '已检测出陪伴能量充足，正在解锁'),
                                     ('lyn22', 'album', '已检测到相关专辑，正在解锁')]:
            result = self.client.post('/api/outfit/unlock', json={'outfitId': id_})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json['message'], message)
            self.assertEqual(result.json['outfit']['unlockMethod'], method)
            self.assertTrue(result.json['outfit']['unlocked'])
            self.assertFalse(result.json['alreadyUnlocked'])
            with sqlite3.connect(self.path) as db:
                record = db.execute('SELECT * FROM outfit_unlocks WHERE outfit_id=?', (id_,)).fetchone()
            self.assertTrue(self.client.post('/api/outfit/unlock', json={'outfitId': id_}).json['alreadyUnlocked'])
            self.client = create_app(self.config).test_client()
            with sqlite3.connect(self.path) as db:
                self.assertEqual(db.execute('SELECT * FROM outfit_unlocks WHERE outfit_id=?', (id_,)).fetchone(), record)
            self.assertTrue(next(x for x in self.client.get('/api/outfits').json['outfits'] if x['id'] == id_)['unlocked'])
        self.assertEqual(self.client.get('/api/bootstrap').json['profile'], before)
        self.assertEqual(self.client.get('/api/widget/appearance').json, widget_before)
        self.assertTrue(self.client.post('/api/outfit/unlock', json={'outfitId': 'zsh09'}).json['alreadyUnlocked'])

    def test_bad_unlocks_have_no_side_effects(self):
        for body in ({}, None, [], {'outfitId': []}, {'outfitId': False}, {'outfitId': '../lyn29.png'}, {'outfitId': 'missing'}):
            self.assertEqual(self.client.post('/api/outfit/unlock', json=body).status_code, 400)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM outfit_unlocks').fetchone()[0], 0)

    def test_widget_returns_stable_png_name_and_changes_only_after_equipping(self):
        initial = self.client.get('/api/widget/appearance')
        self.assertEqual(initial.headers['Cache-Control'], 'no-store')
        self.assertEqual(initial.json, dict(imageName='INFP.png', appearanceId='INFP', appearanceType='personality', revision=0))
        self.client.post('/api/outfit/unlock', json={'outfitId': 'zsh10'})
        self.assertEqual(self.client.get('/api/widget/appearance').json, initial.json)
        self.assertEqual(self.client.post('/api/outfit', json={'outfitId': 'zsh10'}).status_code, 200)
        self.client = create_app(self.config).test_client()
        self.assertEqual(self.client.get('/api/widget/appearance').json,
                         dict(imageName='zsh10.png', appearanceId='zsh10', appearanceType='outfit', revision=1))
        self.assertEqual(self.client.get('/api/widget/image').json, {'imageName': 'zsh10.png'})
        self.assertEqual(self.client.get('/api/personality/image').json, {'imageName': 'zsh10.png'})
        self.client.post('/api/personality', json={'personalityId': 'ENTJ'})
        state = self.client.get('/api/widget/appearance').json
        self.assertEqual(state['imageName'], 'ENTJ.png')
        self.assertEqual(state['revision'], 2)

    def test_webp_variants_are_small_cacheable_and_pngs_remain_available(self):
        root = Path(__file__).resolve().parents[1] / 'public/assets/characters'
        for item in self.client.get('/api/outfits').json['outfits']:
            original = (root / item['imageName']).stat().st_size
            for field in ('thumbnailUrl', 'imageUrl'):
                response = self.client.get(item[field])
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.mimetype, 'image/webp')
                self.assertLess(len(response.data), original / 4)
                cached = self.client.get(item[field], headers={'If-None-Match': response.headers['ETag']})
                self.assertEqual(cached.status_code, 304)
                response.close(); cached.close()
        response = self.client.get('/assets/characters/zsh10.png')
        self.assertEqual(response.mimetype, 'image/png')
        response.close()
        for path in ('thumb-v1/unknown.webp', '../outfits.py', 'web-v1/lyn29.png'):
            self.assertEqual(self.client.get('/assets/characters/' + path).status_code, 404)

    def test_upgrade_keeps_preexisting_selection_without_unlocking_other_outfits(self):
        with sqlite3.connect(self.path) as db:
            db.execute('DROP TABLE outfit_unlocks')
            db.execute("UPDATE app_meta SET value='lyn22' WHERE key='outfit_id'")
            db.execute("UPDATE app_meta SET value='outfit' WHERE key='appearance_mode'")
        client = create_app(self.config).test_client()
        self.assertEqual(client.get('/api/widget/image').json, {'imageName': 'lyn22.png'})
        self.assertEqual(sum(x['unlocked'] for x in client.get('/api/outfits').json['outfits']), 6)


if __name__ == '__main__':
    unittest.main()
