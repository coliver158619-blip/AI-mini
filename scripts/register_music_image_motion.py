"""Register complete generated poses; measure and encode without changing image pixels."""
import json
from pathlib import Path
from PIL import Image
from register_character_motion import measure

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / 'public/assets/music-image-motion'
target.mkdir(parents=True, exist_ok=True)
registry = {}
for source in sorted((ROOT / 'output/music-motion-sources').glob('*.png')):
    image, frames = measure(source, adaptive_columns=True)
    # Start/end at the same complete pose; avoid a two-eye half-blink during wink.
    frames[15] = frames[0]
    frames[7] = frames[0]
    if source.stem == 'INFP':
        frames[6] = frames[5]
    if source.stem == 'ESTP':
        frames[13] = frames[11]
    original = Image.open(ROOT / f'public/assets/music-images/{source.stem}.webp').convert('RGBA')
    alpha = original.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    left, top, right, bottom = alpha.getbbox()
    head = alpha.crop((left, top, right, top + round((bottom-top)*.32))).getbbox()
    scale = 960 / original.height
    layout = dict(height=(bottom-top)*scale, top=top*scale,
                  center=(left+(head[0]+head[2])/2)*scale,
                  widthScale=((right-left)/(bottom-top))/(frames[0]['width']/frames[0]['height']))
    dest = target / f'{source.stem}-v1.webp'
    if not dest.exists() or dest.stat().st_mtime < source.stat().st_mtime:
        image.save(dest, 'WEBP', quality=90, method=6)
    registry[source.stem] = dict(src=f'/assets/music-image-motion/{dest.name}', width=image.width,
                                height=image.height, frames=frames, layout=layout)
    assert len(frames) == 16 and all(f['width'] > 0 and f['height'] > 0 for f in frames)
(ROOT / 'src/music-image-motion.json').write_text(json.dumps(registry, indent=2)+'\n', encoding='utf-8')
print(f'Registered {len(registry)} music images')
