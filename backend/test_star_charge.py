import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import date
from pathlib import Path
from backend.app import create_app
from backend.star_charge import matches


class StarChargeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'test.sqlite3'
        self.app = create_app(dict(TESTING=True, AUTH_ENABLED=True, DATABASE=str(self.path), SEED_DEMO=False, PET_CHAT_MODE='local'))
        self.a, self.b = self.app.test_client(), self.app.test_client()
        result = self.a.post('/api/auth/login', json=dict(nickname='充电测试', gender='male')).json
        self.room = self.path.parent / 'test-rooms' / (result['user']['id'] + '.sqlite3')
        self.initial = result['profile']['energy']
        self.a.post('/api/auth/complete')
        self.b.post('/api/auth/login', json=dict(nickname='另一个昵称', gender='female'))
        self.b.post('/api/auth/complete')

    def test_welcome_once_across_sessions_and_old_accounts(self):
        first = self.a.post('/api/charge/welcome').json
        self.assertTrue(first['awarded'])
        self.assertEqual(first['profile']['energy'], self.initial + 1)
        self.assertFalse(first['profile']['chargeWelcomePending'])
        self.assertTrue(first['profile']['chargeIntroPending'])
        self.b.post('/api/auth/login', json=dict(nickname='充电测试'))
        for client in [self.a,self.b]:
            result = client.post('/api/charge/welcome').json
            self.assertFalse(result['awarded'])
            self.assertEqual(result['profile']['energy'], self.initial + 1)
        with closing(sqlite3.connect(self.room)) as db, db:
            db.execute("DELETE FROM app_meta WHERE key='charge_welcome_pending'")
        self.assertFalse(self.a.post('/api/charge/welcome').json['awarded'])

    def test_artist_totals_alias_collaboration_and_account_isolation(self):
        with closing(sqlite3.connect(self.room)) as db, db:
            db.executemany('INSERT INTO songs VALUES (?,?,?,\'#fff\',\'[]\',NULL)', [('s1','一','周杰倫'),('s2','二','JJ Lin / 邓紫棋'),('s3','三','不是周杰伦')])
            db.executemany("INSERT INTO plays(song_id,seconds,listened_at,mood) VALUES (?,?,'2026-09-20T12:00:00+08:00','开心')", [('s1',120),('s1',60),('s2',150),('s3',600)])
        stats = {s['id']:s for s in self.a.get('/api/charge/artists').json['artists']}
        self.assertEqual((stats['jay']['minutes'],stats['jay']['songs']), (3,1))
        self.assertEqual((stats['jj']['seconds'],stats['gem']['seconds']), (150,150))
        self.assertTrue(all(s['seconds']==0 and s['diaries']==0 for s in self.b.get('/api/charge/artists').json['artists']))
        self.assertTrue(matches('G.E.M.邓紫棋','邓紫棋',['GEM']))
        self.assertTrue(matches('G-DRAGON','权志龙',['G-Dragon']))
        self.assertFalse(matches('周杰伦翻唱合集','周杰伦',[]))

    def test_energy_is_whole_hours_of_accumulated_listening(self):
        with closing(sqlite3.connect(self.room)) as db, db:
            db.execute("INSERT INTO songs VALUES ('hours','测试曲','周杰伦','#fff','[]',NULL)")
        total=0
        for seconds in [3599,1,3599,1]:
            with closing(sqlite3.connect(self.room)) as db, db:
                db.execute("INSERT INTO plays(song_id,seconds,listened_at,mood) VALUES ('hours',?,'2026-09-20T12:00:00+08:00','开心')",(seconds,))
            total+=seconds
            stats=self.a.get('/api/charge/artists').json['artists'][0]
            self.assertEqual(stats['energy'],total//3600)
            self.assertEqual(stats['minutes'],total//60)
            self.assertEqual(stats['songs'],1)

    def test_rewards_require_explicit_claim_and_are_isolated_and_idempotent(self):
        url='/api/charge/rewards/total'
        with closing(sqlite3.connect(self.room)) as db, db:
            db.execute('UPDATE profile SET energy=800 WHERE id=1')
        self.assertEqual(self.a.get(url).json['claimed'], [])
        self.assertEqual(self.a.post(url,json={'stage':1600}).status_code,409)
        self.assertEqual(self.a.post(url,json={'stage':400}).json['claimed'],[400])
        self.assertTrue(self.a.post(url,json={'stage':400}).json['alreadyClaimed'])
        self.assertEqual(self.a.get(url).json['claimed'],[400])
        self.assertEqual(self.b.get(url).json['claimed'],[])
        self.assertEqual(self.a.get('/api/charge/rewards/jay').json['claimed'],[])
        self.assertEqual(self.a.post('/api/charge/rewards/jay',json={'stage':400}).status_code,409)
        with closing(sqlite3.connect(self.room)) as db, db:
            db.execute("INSERT INTO songs VALUES ('reward-hours','测试曲','周杰伦','#fff','[]',NULL)")
            db.executemany("INSERT INTO plays(song_id,seconds,listened_at,mood) VALUES ('reward-hours',3600,'2026-10-27','开心')", [()]*400)
        self.assertEqual(self.a.post('/api/charge/rewards/jay',json={'stage':400}).json['claimed'],[400])
        self.assertEqual(self.a.get('/api/charge/rewards/joker').json['claimed'],[])
        for invalid in [True,-1,1,'400',None]:
            self.assertEqual(self.a.post(url,json={'stage':invalid}).status_code,400)
        self.assertEqual(self.a.get('/api/charge/rewards/unknown').status_code,400)
        self.assertEqual(self.app.test_client().get(url).status_code,401)

    def test_diaries_are_isolated_versioned_and_keep_text_on_ai_failure(self):
        day = date.today().isoformat()
        url = f'/api/stars/jay/diary/{day}'
        body = dict(revision=0,note='今天听音乐放松',body='保留我的手写日记')
        saved = self.a.put(url,json=body)
        self.assertEqual(saved.status_code,200)
        self.assertEqual(saved.json['entry']['revision'],1)
        self.assertEqual(self.a.put(url,json=body).status_code,409)
        self.assertEqual(self.a.post(url+'/story',json=dict(revision=1)).status_code,503)
        self.assertEqual(self.a.get('/api/stars/jay/diary').json['entries'][0]['body'],body['body'])
        self.assertEqual(self.a.get('/api/stars/joker/diary').json['entries'][0]['body'],'')
        self.assertEqual(self.b.get('/api/stars/jay/diary').json['entries'][0]['body'],'')
        self.assertEqual(self.a.get('/api/charge/artists').json['artists'][0]['diaries'],1)
        self.assertEqual(self.a.put('/api/stars/unknown/diary/'+day,json=body).status_code,400)
        self.assertEqual(self.a.put('/api/stars/jay/diary/2099-01-01',json=body).status_code,400)
        self.assertEqual(self.app.test_client().get('/api/charge/artists').status_code,401)

    def test_mini_seed_is_repeatable_preserves_writing_and_excludes_other_users(self):
        from backend.seed_star_demo import seed
        self.a.post('/api/auth/login',json=dict(nickname='mini',gender='male'))
        self.a.post('/api/auth/complete')
        url='/api/stars/jay/diary/2026-09-20'
        self.a.put(url,json=dict(revision=0,note='已有的心情',body='手写的内容'))
        first=seed(self.path)
        second=seed(self.path)
        self.assertTrue(Path(first['backup']).is_file())
        self.assertEqual((second['addedPlays'],second['addedDiaries']),(0,0))
        self.assertEqual(first['artists'],second['artists'])
        self.assertTrue(all(s['minutes']>0 and s['songs']>0 and s['diaries']>0 for s in first['artists']))
        entries=self.a.get('/api/stars/jay/diary').json['entries']
        self.assertEqual(next(e for e in entries if e['date']=='2026-09-20')['body'],'手写的内容')
        self.assertTrue(all(s['minutes']==0 and s['diaries']==0 for s in self.b.get('/api/charge/artists').json['artists']))


if __name__ == '__main__':
    unittest.main()
