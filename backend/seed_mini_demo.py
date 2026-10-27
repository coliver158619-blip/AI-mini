"""Fill mini's demo history without replacing existing listening or written memories.

Run explicitly: python -m backend.seed_mini_demo --database backend/data/companion.sqlite3
"""
import argparse
from contextlib import closing
from datetime import date, datetime, time, timedelta
import json
from pathlib import Path
import random
import sqlite3

from flask import g
from .app import create_app, get_db, live_diary_entry, LOCAL_ZONE

START = date(2024, 1, 1)
DIARY_START = date(2026, 9, 20)
MEMORIES = [
 ('把周末留给自己', '放松', '周末没有安排满满的行程，只想把节奏放慢一点。'),
 ('新一周的小小出发', '专注', '把待办写在纸上，先从最容易完成的一件事开始。'),
 ('耳机里的短途旅行', '通勤', '熟悉的路也可以有新的背景音乐，沿途的一切忽然轻盈了一些。'),
 ('给忙碌按一次暂停', '治愈', '今天想做的事情很多，先停下来喘口气，再整理自己的步调。'),
 ('让旋律整理桌面', '专注', '收拾好桌面，再打开一段轻柔的旋律，注意力也一点点回来了。'),
 ('周五的轻快尾音', '开心', '一周走到尾声，想用一首轻快的歌，庆祝那些认真度过的时刻。'),
 ('午后的慢时光', '放松', '没有必须赶到的地方，把一个安静的下午留给自己。'),
 ('把小事认真记下', '治愈', '今天的快乐很小，却值得留在这一页里，等以后再翻出来看看。'),
 ('重新开始也很好', '专注', '计划偶尔会被打乱，那就换一个顺序，从眼前的小事继续。'),
 ('九月最后的散步', '通勤', '慢慢走过熟悉的街道，让歌声陪着脚步，不着急抵达。'),
 ('和九月轻轻道别', '放松', '这个月有忙碌，也有停顿。想把那些微小的进步一起收好。'),
 ('十月的第一首歌', '开心', '翻开新的月份，给自己留一点期待，去发现日常里的新鲜感。'),
 ('假日里的小惊喜', '开心', '不必去很远的地方，一顿喜欢的饭，也能让普通的一天亮起来。'),
 ('换一条熟悉的路', '通勤', '今天想换一条路走走，把注意力从屏幕移到身边的风景。'),
 ('给房间换个心情', '放松', '整理房间时放起了音乐，收好物品，也给心情腾出一些位置。'),
 ('认真吃一顿晚饭', '治愈', '把晚饭慢慢吃完，不催促自己，认真感受这段属于生活的时间。'),
 ('收藏假日的尾声', '放松', '假日里的松弛很珍贵，想把这种不慌不忙的感觉带进日常。'),
 ('为明天留一点余裕', '专注', '把明天需要的东西提前准备好，不必一下子进入最快的节奏。'),
 ('找回自己的步调', '专注', '重新开始忙碌时有一点不习惯，那就先做好手边的一小部分。'),
 ('不必一次做到完美', '治愈', '有些事情还没达到预期，但认真尝试过的每一步都有意义。'),
 ('夜里的小小奖励', '开心', '完成一件拖了很久的小事，给自己一个微小而踏实的奖励。'),
 ('放空也算一种安排', '放松', '今天允许自己暂时不安排什么，让脑袋像房间一样透透气。'),
 ('走向更轻的心情', '运动', '起身活动了一会儿，听着有节奏的音乐，把紧绷慢慢放下来。'),
 ('从一小步开始', '专注', '新的星期不必立下很大的目标，先给自己一个能完成的小起点。'),
 ('被一段旋律接住', '治愈', '思绪有点杂乱的时候，不急着解释，先静静听完一首歌。'),
 ('把专注留给此刻', '专注', '关掉不必要的提醒，让手头的事情拥有一段不被打扰的时间。'),
 ('晚风里的放松时刻', '通勤', '结束忙碌后放慢脚步，给回家的路换上一段柔和的旋律。'),
 ('把好心情分享出去', '开心', '想起一段轻松的聊天，原来开心也会从很普通的小事里冒出来。'),
 ('给自己充一会儿电', '放松', '不用每个周末都做很多事情，好好休息本身也是一种照顾。'),
 ('让房间安静下来', '睡眠', '把灯光调柔和一些，让声音也慢下来，给睡前留一点安静。'),
 ('新的星期慢慢来', '专注', '今天的待办还有很多，但不必急着追上所有人，按自己的节奏就好。'),
 ('听见平凡的快乐', '开心', '给日常加一点自己喜欢的声音，平凡的片刻也能值得期待。'),
 ('停一停再出发', '治愈', '如果暂时没有头绪，就给自己几分钟空白，答案不必立刻出现。'),
 ('和秋天并肩走走', '通勤', '想用一段慢慢的路程结束今天，把没说完的心事交给旋律。'),
 ('这一周已经很努力', '放松', '一周走到这里，先肯定一下认真坚持的自己，再计划接下来的事情。'),
 ('周末的小小仪式', '开心', '为自己准备一杯喜欢的饮品，挑一首歌，让周末有一个轻松的开场。'),
 ('留一点温柔给明天', '治愈', '整理这一周的心情，也给明天留一点余裕，不把自己安排得太满。'),
 ('和 mini 一起出发', '专注', '新的星期，先完成一件小事，再把今天想做的事情慢慢展开。'),
 ('今天也有音乐陪着', '治愈', '打开小屋的时候，想给自己一点鼓励：今天也可以按自己的步调向前。'),
]


def seed(database: Path, today: date):
    registry = database.parent / (database.stem + '-rooms') / 'accounts.sqlite3'
    if not registry.is_file():
        raise ValueError('Account registry does not exist')
    with closing(sqlite3.connect(registry)) as accounts:
        user = accounts.execute("SELECT id FROM users WHERE name_key='mini'").fetchone()
    if not user:
        raise ValueError('mini must already be registered')
    target = registry.parent / (user[0] + '.sqlite3')
    if not target.is_file() or today < DIARY_START:
        raise ValueError('Invalid target or date')
    backup = target.parent / 'backups' / f'mini-before-demo-{datetime.now(LOCAL_ZONE):%Y%m%d-%H%M%S-%f}.sqlite3'
    backup.parent.mkdir(exist_ok=True)
    with closing(sqlite3.connect(target)) as source, closing(sqlite3.connect(backup)) as destination:
        source.backup(destination)

    app = create_app(dict(TESTING=True, AUTH_ENABLED=False, SEED_DEMO=False, DATABASE=str(target), PET_CHAT_MODE='local'))
    added_plays = added_diaries = 0
    with app.app_context():
        g.user_database = str(target)
        db = get_db()
        songs = db.execute("SELECT id FROM songs WHERE artist IN ('周杰伦','陈奕迅','林俊杰','孙燕姿','五月天','许嵩') ORDER BY id").fetchall()
        if not songs:
            songs = db.execute('SELECT id FROM songs ORDER BY id').fetchall()
        if not songs:
            raise ValueError('Cannot seed without a song catalog')
        existing_days = {row[0] for row in db.execute('SELECT DISTINCT substr(listened_at,1,10) FROM plays')}
        with db:
            day = START
            while day <= today:
                rng = random.Random('mini-demo-v1:' + day.isoformat())
                # Sparse early history, more regular listening in later years, daily diary coverage.
                active = day >= DIARY_START or rng.random() < {2024:.42, 2025:.57}.get(day.year,.7)
                if active and day.isoformat() not in existing_days:
                    mood = MEMORIES[(day - DIARY_START).days % len(MEMORIES)][1]
                    for index in range(rng.randint(6, 14) + (day.year - 2024) * 2):
                        key = f'mini-demo-v1:{day}:{index}'
                        # Today's demo stays before the current local clock.
                        at = datetime.combine(day, time(0, 5), LOCAL_ZONE) + timedelta(minutes=index * 5)
                        added_plays += db.execute('INSERT OR IGNORE INTO plays(song_id,seconds,listened_at,mood,is_demo,event_id,session_id) VALUES (?,?,?,?,1,?,?)',
                            (rng.choice(songs)[0], rng.randint(150, 290), at.isoformat(), mood, key, key)).rowcount
                day += timedelta(days=1)
            day = DIARY_START
            while day <= today:
                key = day.isoformat()
                edition = db.execute('SELECT entry FROM diary_editions WHERE date=?', (key,)).fetchone()
                old = json.loads(edition[0]) if edition else None
                story = db.execute('SELECT text FROM diary_stories WHERE date=?', (key,)).fetchone()
                # Keep written editions and model stories; only fill a known empty placeholder.
                empty = old and old.get('mood') == '等待记录' and not old.get('note') and not old.get('story', {}).get('text') and not old.get('topSong')
                if (old and not empty) or (story and story[0]):
                    day += timedelta(days=1)
                    continue
                entry = live_diary_entry(day)
                title, mood, opening = MEMORIES[(day - DIARY_START).days % len(MEMORIES)]
                top = entry['topSong']
                song_line = f"今天一起听了 {entry['minutes']} 分钟，遇见 {entry['songCount']} 首歌。最常停留的是《{top['title']}》，熟悉的旋律让这一刻多了一点陪伴。" if top else '今天留一点安静的时间，听听自己的心情。'
                body = opening + '\n\n' + song_line + '\n\n' + ['不必把每一天都过得耀眼，愿意认真感受生活，就已经很好。','把这一页折成一个小小的记号，下次翻到这里，还能想起今天的心情。','有些进步只有自己知道，也值得被好好记住。下一段旋律里，我们继续慢慢走。','音乐停下来的时候，心情也轻了一点。愿明天的自己，多一点从容。'][(day - DIARY_START).days % 4]
                stamp = datetime.combine(day, time(0, 5), LOCAL_ZONE).isoformat()
                entry.update(title=title, body=body, mood=mood, isDemo=True)
                entry['story'].update(text=body, source='demo', updatedAt=stamp, canGenerate=False)
                db.execute("INSERT INTO diary_stories(date,text,updated_at,source) VALUES (?,?,?,'demo') ON CONFLICT(date) DO UPDATE SET text=excluded.text,updated_at=excluded.updated_at,source='demo' WHERE diary_stories.text=''", (key, body, stamp))
                if day < today:
                    if empty:
                        db.execute('UPDATE diary_editions SET entry=? WHERE date=?', (json.dumps(entry, ensure_ascii=False), key))
                    else:
                        db.execute('INSERT OR IGNORE INTO diary_editions(date,entry) VALUES (?,?)', (key, json.dumps(entry, ensure_ascii=False)))
                added_diaries += 1
                day += timedelta(days=1)
            db.execute("INSERT OR REPLACE INTO app_meta VALUES ('demo_diary_start', ?)", (DIARY_START.isoformat(),))
            db.execute("INSERT OR REPLACE INTO app_meta VALUES ('demo_report_start', ?)", (START.isoformat(),))
    return dict(account='mini', addedPlays=added_plays, addedDiaries=added_diaries, backup=str(backup), through=today.isoformat())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--through', type=date.fromisoformat, default=datetime.now(LOCAL_ZONE).date())
    args = parser.parse_args()
    print(json.dumps(seed(args.database.resolve(), args.through), ensure_ascii=False))
