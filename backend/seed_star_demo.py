"""Add mini-only star listening history and diaries; preserve existing records."""
import argparse
from contextlib import closing
from datetime import date, datetime, time, timedelta
import json
from pathlib import Path
import sqlite3

from flask import g
from .app import create_app, get_db, LOCAL_ZONE
from .star_charge import ARTISTS, matches

# Titles are display metadata only; no fabricated audio URLs or artist recordings.
SONGS = [
 ['晴天','七里香','稻香','告白气球','夜曲','青花瓷','简单爱','一路向北','搁浅','蒲公英的约定'],
 ['演员','认真的雪','丑八怪','绅士','天外来物','刚刚好','意外','你还要我怎样'],
 ['江南','小酒窝','曹操','修炼爱情','可惜没如果','她说','背对背拥抱','不为谁而作的歌','交换余生'],
 ['有何不可','清明雨上','素颜','庐州月','如果当时','雅俗共赏','断桥残雪'],
 ['光年之外','泡沫','来自天堂的魔鬼','句号','多远都要在一起','倒数'],
 ['十年','好久不见','浮夸','红玫瑰','爱情转移','富士山下','孤勇者','K歌之王','你的背包','葡萄成熟时'],
 ['模特','李白','年少有为','不将就','戒烟','麻雀','乌梅子酱'],
 ['有点甜','一笑倾城','不分手的恋爱','万有引力','年轮','忽而今夏'],
 ['让酒','天问','一爱如故','寻一个你','长风渡'],
 ['Untitled, 2014','Crooked','Heartbreaker','Crayon','Who You?','One of a Kind','Power','Home Sweet Home'],
]
MINUTES = [1386,968,1168,728,886,1024,568,628,496,786]
SCENES = [
 ('下班路上', '忙碌了一整天，回家路上把脚步放慢。'),
 ('周末午后', '给自己泡了一杯茶，把这个下午留给喜欢的音乐。'),
 ('重新出发', '今天有些事情没有按计划进行，先整理心情，再一点点继续。'),
 ('夜里的安静', '关掉多余的提醒，终于有时间认真听完一首歌。'),
 ('一点小进步', '完成了拖延很久的小事，想用音乐给今天画一个开心的句号。'),
 ('秋日散步', '沿着熟悉的路慢慢走，耳机里的旋律让普通的风景也有了温度。'),
 ('写给明天', '把今天的心情收好，明天也要记得给自己留一点余裕。'),
]


def seed(database: Path):
    registry = database.parent / (database.stem + '-rooms') / 'accounts.sqlite3'
    with closing(sqlite3.connect(f'file:{registry.as_posix()}?mode=ro', uri=True)) as accounts:
        user = accounts.execute("SELECT id FROM users WHERE name_key='mini'").fetchone()
    if not user:
        raise ValueError('mini must already exist')
    target = registry.parent / (user[0] + '.sqlite3')
    if not target.is_file():
        raise ValueError('mini room is missing')
    backup = target.parent / 'backups' / f'mini-before-star-demo-{datetime.now(LOCAL_ZONE):%Y%m%d-%H%M%S-%f}.sqlite3'
    backup.parent.mkdir(exist_ok=True)
    with closing(sqlite3.connect(target)) as source, closing(sqlite3.connect(backup)) as destination:
        source.backup(destination)
    app = create_app(dict(TESTING=True, AUTH_ENABLED=False, SEED_DEMO=False, DATABASE=str(target), PET_CHAT_MODE='local'))
    added_plays = added_diaries = 0
    with app.app_context():
        g.user_database = str(target)
        db = get_db()
        with db:
            for i, (artist_id, name, aliases) in enumerate(ARTISTS):
                ids = []
                for j, title in enumerate(SONGS[i]):
                    existing = next((r for r in db.execute('SELECT id,artist FROM songs WHERE title=?', (title,)) if matches(r['artist'], name, aliases)), None)
                    song_id = existing['id'] if existing else f'star-demo-{artist_id}-{j}'
                    db.execute('INSERT OR IGNORE INTO songs VALUES (?,?,?,?,?,NULL)', (song_id, title, name, '#d9a4c5', '["放松"]'))
                    ids.append(song_id)
                # Short individual listening sessions spread across Sep 20–Oct 26.
                seconds_left, n = MINUTES[i] * 60, 0
                while seconds_left:
                    seconds = min(seconds_left, 180 + n % 7 * 13)
                    day = date(2026,9,20) + timedelta(days=n % 37)
                    stamp = datetime.combine(day, time(9,0), LOCAL_ZONE) + timedelta(minutes=(n // 37)*6)
                    key = f'star-charge-demo-v1:{artist_id}:{n}'
                    added_plays += db.execute('INSERT OR IGNORE INTO plays(song_id,seconds,listened_at,mood,is_demo,event_id,session_id) VALUES (?,?,?,?,1,?,?)', (ids[n % len(ids)], seconds, stamp.isoformat(), '放松', key, key)).rowcount
                    seconds_left -= seconds
                    n += 1
                for j in range(4 + i % 4):
                    day = date(2026,9,20) + timedelta(days=j*5)
                    scene, opening = SCENES[(i+j) % len(SCENES)]
                    song = SONGS[i][j % len(SONGS[i])]
                    note = f'{scene}，听了{name}的《{song}》。{opening}'
                    body = f'{opening}\n\n今天选择了{name}的《{song}》，听着熟悉的旋律，心里的声音也慢慢清晰起来。不是为了赶去哪里，只是想认真陪自己度过这一小段时间。\n\n' + [
                        '这段音乐像给日常留的一枚书签。以后再听见它，应该还会想起今天慢慢放松下来的自己。',
                        '不必每一天都特别精彩，能在忙碌里找到属于自己的节奏，就已经是一件值得记下的事。',
                        '把这份轻盈写进日记，留给未来有点疲惫的自己。愿下一次打开耳机，仍能找到继续向前的勇气。',
                    ][(i+j)%3]
                    added_diaries += db.execute("INSERT OR IGNORE INTO star_diary(artist_id,date,note,body,revision,source,updated_at) VALUES (?,?,?,?,1,'demo',?)", (artist_id, day.isoformat(), note, body, datetime.combine(day,time(21,0),LOCAL_ZONE).isoformat())).rowcount
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    stats = app.test_client().get('/api/charge/artists').json['artists']
    return dict(account='mini', backup=str(backup), addedPlays=added_plays, addedDiaries=added_diaries, artists=stats)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    print(json.dumps(seed(parser.parse_args().database.resolve()), ensure_ascii=False))
