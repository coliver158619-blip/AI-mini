"""Resolve the two saved appearances without changing either selection."""
from .outfits import CHARACTERS, outfit_for_id
from .personalities import personality_for_id

def appearance_state(db):
    meta = dict(db.execute("SELECT key,value FROM app_meta WHERE key IN ('outfit_id','personality_id','appearance_mode','outfit_lyn','outfit_zsh','personality_site_revision')"))
    outfit = outfit_for_id(meta.get('outfit_id'))
    personality = personality_for_id(meta.get('personality_id'))
    mode = 'outfit' if meta.get('appearance_mode') == 'outfit' else 'personality'
    active = outfit if mode == 'outfit' else personality
    remembered = {}
    for character in CHARACTERS:
        item = outfit_for_id(meta.get('outfit_' + character['id'], character['defaultOutfitId']))
        remembered[character['id']] = item['id'] if item['characterId'] == character['id'] else character['defaultOutfitId']
    return dict(outfitId=outfit['id'], outfit=outfit, personalityId=personality['id'], personality=personality,
                appearanceMode=mode, appearance={key: active[key] for key in ('id','name','imageName','imageUrl')},
                characterOutfitIds=remembered), int(meta.get('personality_site_revision', 0))
