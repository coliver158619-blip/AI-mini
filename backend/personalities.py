"""Authored character settings, rather than inferred personality assessments."""
DEFAULT_PERSONALITY_ID = "INFP"
GROUPS = [
    {"id": "analysts", "name": "分析家", "color": "#e7dff3", "accent": "#8b70ac"},
    {"id": "diplomats", "name": "外交家", "color": "#e1ecda", "accent": "#7d9a68"},
    {"id": "sentinels", "name": "守护者", "color": "#dfe9ef", "accent": "#7896ab"},
    {"id": "explorers", "name": "探险家", "color": "#f4e6c6", "accent": "#bd9955"},
]

# The traits, music styles, and companionship copy are creative character settings.
_SETTINGS = [
    ("INTJ", "analysts", "构筑旋律的人", "在层层铺开的旋律里，找一条通往远方的线索。", ["独立思考", "沉静", "远见"], ["器乐", "电子氛围", "后摇"], "安静同行，留一点思考的空间"),
    ("INTP", "analysts", "声波探索家", "一段特别的和弦，也许就是今天最有趣的发现。", ["好奇", "探索", "想象"], ["实验电子", "爵士", "器乐"], "一起发现细节，聊聊新鲜想法"),
    ("ENTJ", "analysts", "节奏领航员", "让坚定的鼓点，为每一个想实现的计划开场。", ["果断", "目标感", "行动"], ["摇滚", "电子", "史诗配乐"], "用有力的节奏，为行动加油"),
    ("ENTP", "analysts", "灵感混音师", "不按歌单的顺序走，下一首也许会有惊喜。", ["机智", "自由", "创意"], ["融合爵士", "另类流行", "实验音乐"], "交换奇思妙想，把日常玩出新意"),
    ("INFJ", "diplomats", "夜曲倾听者", "把没说出口的心事，轻轻放进一段温柔旋律。", ["共情", "细腻", "笃定"], ["氛围音乐", "钢琴", "独立民谣"], "慢慢听你说，珍惜细小的感受"),
    ("INFP", "diplomats", "微光造梦家", "一首歌，一阵风，陪你把小小的心愿慢慢收藏。", ["温柔", "浪漫", "想象"], ["独立民谣", "轻音乐", "梦幻流行"], "温柔陪伴，让心情有地方停靠"),
    ("ENFJ", "diplomats", "暖心和声者", "想把一首明亮的歌，送给每个认真生活的你。", ["热忱", "鼓励", "共鸣"], ["温暖流行", "灵魂乐", "合唱"], "看见你的努力，分享一点好心情"),
    ("ENFP", "diplomats", "追风逐拍者", "背上好奇心出发，每段旋律都是一条新风景。", ["热情", "好奇", "活力"], ["独立流行", "放克", "旅行民谣"], "发现生活里的惊喜，一起开心出发"),
    ("ISTJ", "sentinels", "时光收藏家", "把喜欢的歌认真收好，让熟悉的旋律陪伴每一天。", ["可靠", "专注", "耐心"], ["经典流行", "古典", "器乐"], "稳稳地陪着你，记住日常的小约定"),
    ("ISFJ", "sentinels", "温柔守候者", "为今天留一首安心的歌，也为你留一盏灯。", ["体贴", "细心", "守候"], ["抒情流行", "轻音乐", "原声音乐"], "照顾细微的心情，给你熟悉的安心"),
    ("ESTJ", "sentinels", "节拍规划师", "找到自己的节奏，一件一件完成今天的小目标。", ["条理", "担当", "坚持"], ["经典摇滚", "进行曲", "节奏流行"], "一起安排日常，让节奏清晰起来"),
    ("ESFJ", "sentinels", "日光分享家", "喜欢一首歌的时候，也想让身边的人一起听见。", ["亲切", "分享", "照顾"], ["华语流行", "轻快民谣", "经典金曲"], "分享生活的温度，陪你聊聊今天"),
    ("ISTP", "explorers", "音轨漫游者", "顺着一段吉他走走，在声音里找到自在的空间。", ["自在", "敏锐", "动手"], ["蓝调", "吉他", "车库摇滚"], "不急着说话，也能轻松待在一起"),
    ("ISFP", "explorers", "旋律绘梦师", "把今天的颜色，悄悄画进一段柔软的旋律里。", ["感性", "审美", "随心"], ["独立音乐", "原声民谣", "新灵魂乐"], "一起感受此刻，把美好慢慢留下"),
    ("ESTP", "explorers", "律动冒险家", "鼓点响起就出发，让每个当下都充满动感。", ["勇敢", "直接", "活力"], ["嘻哈", "舞曲", "节奏蓝调"], "跟上你的步伐，一起尝试新鲜事"),
    ("ESFP", "explorers", "闪耀舞台家", "快乐就跟着唱出来，让好心情感染整个小屋。", ["开朗", "表现力", "快乐"], ["舞曲流行", "迪斯科", "放克"], "把普通的一天，过成小小的演唱会"),
]
PERSONALITIES = []
for code, group_id, name, description, traits, music, companionship in _SETTINGS:
    group = next(group for group in GROUPS if group["id"] == group_id)
    PERSONALITIES.append({"id": code, "name": name, "description": description, "groupId": group_id,
                          "groupName": group["name"], "color": group["color"], "accent": group["accent"],
                          "traits": traits, "musicStyles": music, "companionship": companionship,
                          "imageName": f"{code}.png", "imageUrl": f"/assets/personalities/{code}.png"})
PERSONALITIES_BY_ID = {item["id"]: item for item in PERSONALITIES}


def personality_for_id(id_):
    return PERSONALITIES_BY_ID.get(id_, PERSONALITIES_BY_ID[DEFAULT_PERSONALITY_ID])
