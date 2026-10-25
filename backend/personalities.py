"""Paired music-style characters shared with the H5 catalog."""
import json
from pathlib import Path
DEFAULT_PERSONALITY_ID = "INFP"
_catalog = json.loads((Path(__file__).resolve().parents[1] / 'shared/music-images.json').read_text(encoding='utf-8'))
GROUPS = _catalog['groups']
PERSONALITIES = []
for item in _catalog['images']:
    group = next(group for group in GROUPS if group['id'] == item['groupId'])
    PERSONALITIES.append({**item, 'groupName':group['name'], 'color':group['color'], 'accent':group['accent'],
                          'musicStyles':[item['name'],item['englishName']], 'companionship':item['description']})
PERSONALITIES_BY_ID = {item['id']:item for item in PERSONALITIES}
def personality_for_id(id_):
    return PERSONALITIES_BY_ID.get(id_, PERSONALITIES_BY_ID[DEFAULT_PERSONALITY_ID])
