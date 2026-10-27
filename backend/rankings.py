"""Stable fictional intimacy boards, isolated from real room/relationship data."""
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import unicodedata

from flask import g, jsonify, request

# IDs are stable across refreshes; aliases support common searches as well as Chinese names.
_NAMES = '''刘宇宁 张韶涵 周杰伦 陈奕迅 林俊杰 孙燕姿 五月天 许嵩 王菲 邓紫棋 张杰 周深 毛不易 薛之谦 王一博 肖战 易烊千玺 王俊凯 王源 刘亦菲 赵丽颖 杨紫 杨幂 迪丽热巴 胡歌 白鹿 赵露思 檀健次 成毅 龚俊 张碧晨 梁静茹 蔡依林 刘若英 梁咏琪 莫文蔚 田馥甄 蔡健雅 陈绮贞 魏如萱 郁可唯 黄丽玲 王心凌 杨丞琳 李宇春 张靓颖 周笔畅 尚雯婕 袁娅维 单依纯 黄霄雲 陈粒 房东的猫 告五人 落日飞车 苏打绿 吴青峰 张悬 万芳 张惠妹 伍佰 任贤齐 李宗盛 罗大佑 朴树 许巍 郑钧 汪峰 崔健 赵雷 李健 陈楚生 陆虎 王铮亮 张远 苏醒 王栎鑫 汪苏泷 徐良 胡夏 许飞 何洁 吉克隽逸 金志文 金玟岐 胡彦斌 陶喆 王力宏 萧敬腾 潘玮柏 吴克群 张信哲 张学友 刘德华 黎明 郭富城 谭咏麟 李克勤 许冠杰 陈慧娴 叶倩文 林忆莲 梅艳芳 容祖儿 杨千嬅 卫兰 卢巧音 郑秀文 陈慧琳 谢安琪 关心妍 周慧敏 彭羚 张敬轩 方大同 侧田 陈柏宇 洪卓立 林宥嘉 萧煌奇 韦礼安 卢广仲 八三夭 茄子蛋 动力火车 信乐团 飞儿乐团 张震岳 热狗 蛋堡 艾怡良 刘柏辛 陈婧霏 刘恋 黄龄 旅行团 乐队的夏天 好妹妹 水木年华 南征北战 鹿先森乐队 声音碎片 痛仰 新裤子 刺猬 逃跑计划 二手玫瑰 达达乐队 回春丹 五条人 康姆士 霓虹花园 椅子乐团 温蒂漫步 理想混蛋 夏日入侵企画 橘子海 丢火车 海龟先生 马赛克 达闻西 棱镜 岛屿心情 陈鸿宇 马頔 宋冬野 好好先生 阿肆 花粥 陈一发儿 曾轶可 魏晨 李荣浩 张艺兴 华晨宇 刘雨昕 孟美岐 吴宣仪 宋茜 宋雨琦 张韶轩'''.split()[:128]
_ALIASES = {'刘宇宁': 'liuyuning lyn', '张韶涵': 'zhangshaohan zsh angela', '周杰伦': 'zhoujielun zjl jay', '陈奕迅': 'chenyixun cyx eason', '林俊杰': 'linjunjie ljj jj', '孙燕姿': 'sunyanzi syz stefanie', '五月天': 'wuyuetian wyt mayday', '许嵩': 'xusong xs vae'}
_COLORS = ['#eadffa', '#ffe0eb', '#dfeefa', '#e0f1e8', '#ffecd7', '#e7e5fa']
_PORTRAITS = {item['id']: item for item in json.loads((Path(__file__).resolve().parent.parent / 'public/assets/star-portraits/sources.json').read_text(encoding='utf-8'))['portraits']}

def portrait(id_):
    item = _PORTRAITS[id_]
    return dict(imageUrl=item['path'], imageTransform=item.get('avatarTransform', 'none'))

STARS = [dict(id='lyn' if i == 0 else 'zsh' if i == 1 else f'star-{i + 1:03}', name=name,
              initials=name[:1], color=_COLORS[i % len(_COLORS)],
              **portrait('lyn' if i == 0 else 'zsh' if i == 1 else f'star-{i + 1:03}'),
              keywords=name + ' ' + _ALIASES.get(name, '')) for i, name in enumerate(_NAMES)]
BY_ID = {star['id']: star for star in STARS}
_PREFIXES = ['晚风', '云朵', '银河', '小岛', '月亮', '橘子', '晴天', '薄荷', '星河', '落日', '山海', '奶茶']
_SUFFIXES = ['听你唱', '收集家', '的耳机', '慢慢走', '有回声', '与旋律', '小唱片', '在路上']


def number(value):
    return int(hashlib.sha256(value.encode()).hexdigest()[:12], 16)


def public_star(star):
    return {key: value for key, value in star.items() if key != 'keywords'}


def query():
    if len(request.args.getlist('q')) > 1:
        raise ValueError('请只提供一个搜索关键词')
    text = unicodedata.normalize('NFKC', request.args.get('q', '')).strip().casefold()
    if len(text) > 40:
        raise ValueError('搜索关键词不能超过 40 字')
    return text


def match(star, text):
    return text in star['keywords'].casefold()


def my_score(star, seed):
    top = {'lyn': 128620, 'zsh': 116880, 'star-003': 92760}
    return top[star['id']] + number(seed + star['id']) % 1200 if star['id'] in top else 120 + number(seed + ':' + star['id']) % 88000


@lru_cache(maxsize=16)
def supporters(star_id):
    rows = []
    for i in range(1199):
        value = number(f'ranking-demo-v1:{star_id}:{i}')
        fraction = (value % 1000000) / 1000000
        rows.append(dict(userId=f'demo-user-{i:04}', name=f'{_PREFIXES[i % 12]}{_SUFFIXES[(i // 12) % 8]}{i // 96 + 1:02}',
                         color=_COLORS[i % 6], intimacy=600 + int(590000 * fraction ** 4), isMe=False))
    return rows


def register_rankings(app, get_profile):
    def viewer():
        user = getattr(g, 'room_user', {})
        return user.get('id', 'legacy-demo'), get_profile()['name']

    def personal_rows():
        seed, _ = viewer()
        rows = [dict(star=public_star(star), intimacy=my_score(star, seed)) for star in STARS]
        rows.sort(key=lambda row: (-row['intimacy'], row['star']['id']))
        return [dict(**row, rank=i + 1, inTop100=i < 100) for i, row in enumerate(rows)]

    @app.get('/api/rankings/stars')
    def ranking_stars():
        text = query()
        matches = [public_star(star) for star in STARS if match(star, text)]
        return jsonify(stars=matches, total=len(matches), isDemo=True)

    @app.get('/api/rankings/star')
    def star_board():
        for key in ('starId', 'offset', 'limit'):
            if len(request.args.getlist(key)) > 1:
                raise ValueError('榜单参数不能重复')
        star = BY_ID.get(request.args.get('starId', 'lyn'))
        if not star:
            raise ValueError('没有找到这位明星')
        try:
            offset, limit = int(request.args.get('offset', '0')), int(request.args.get('limit', '50'))
        except ValueError:
            raise ValueError('分页参数必须是整数') from None
        if not 0 <= offset <= 1000 or not 1 <= limit <= 100:
            raise ValueError('每次可读取 1–100 名用户，最多展示前 1000 名')
        seed, name = viewer()
        current = dict(userId='viewer', name=name, color='#f9deec', intimacy=my_score(star, seed), isMe=True)
        rows = [*supporters(star['id']), current]
        rows.sort(key=lambda row: (-row['intimacy'], row['userId']))
        my_rank = next(i + 1 for i, row in enumerate(rows) if row['isMe'])
        top = [dict(**row, rank=i + 1) for i, row in enumerate(rows[:1000])]
        end = min(offset + limit, 1000)
        return jsonify(star=public_star(star), entries=top[offset:end], total=1000, participantCount=len(rows),
                       nextOffset=end if end < 1000 else None, isDemo=True,
                       viewer=dict(**current, rank=my_rank, inTop1000=my_rank <= 1000,
                                   gapToEnter=max(0, top[-1]['intimacy'] - current['intimacy'] + 1)))

    @app.get('/api/rankings/personal')
    def personal_board():
        rows = personal_rows()
        return jsonify(entries=rows[:100], total=min(100, len(rows)), availableStars=len(rows), isDemo=True)

    @app.get('/api/rankings/personal/search')
    def personal_search():
        text = query()
        rows = personal_rows()
        return jsonify(matches=[row for row in rows if text and match(BY_ID[row['star']['id']], text)], isDemo=True)
