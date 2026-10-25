"""Install the three generated replacements without changing approved existing characters.

Encode images and measure full poses; retain generated pixels and transparency.
Run with the generated source folder as the only argument.
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image
from register_character_motion import measure

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
FILES = {
    'ISTJ': ['05e62d95-663a-4cb7-9dab-16170f8f0fc1', '5b8953c9-1365-4241-bf67-c8dd4c8a6317', '43eb7018-0168-4f3a-8222-cd0378f2041f'],
    'ISFJ': ['269b68fc-efca-4de8-8025-9092dee9b494', 'de345fdb-eb4e-4e3a-8816-a98e698b66b7', '2554427c-9917-4fe5-a4bc-89f386948f21'],
    'ESFJ': ['488a17ec-a995-4790-804e-ee54b292b77f', '9bc3f309-bc03-4779-a97d-76bfc648c1cf', '7476a7b6-51fb-4772-99f0-89c18e650898'],
}
registry_path = ROOT / 'src/music-image-motion.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
workspace_sources = ROOT / 'output/paired-music-sources'
workspace_sources.mkdir(parents=True, exist_ok=True)
for id_, files in FILES.items():
    paths = []
    for kind, file in zip(('portrait', 'motion', 'lean'), files):
        path = workspace_sources / f'{id_}-{kind}.png'
        shutil.copy2(SOURCE / f'exec-{file}.png', path)
        paths.append(path)
    original = Image.open(paths[0]).convert('RGBA')
    original.save(ROOT / f'public/assets/music-images/{id_}-v2.webp', 'WEBP', quality=92, method=6)
    # Native image-name contract stays stable while its asset changes with the catalog.
    shutil.copy2(paths[0], ROOT / f'public/assets/personalities/{id_}.png')
    lean = Image.open(paths[2]).convert('RGBA')
    lean.save(ROOT / f'public/assets/report-companions/{id_}-v2.webp', 'WEBP', quality=92, method=6)
    image, frames = measure(paths[1], adaptive_columns=True)
    frames[15] = frames[7] = frames[0]
    frames[6] = frames[5]
    if id_ == 'ISTJ':
        # Keep the same free hand throughout the entire greeting.
        frames[10], frames[11], frames[12] = frames[9], frames[13], frames[9]
    alpha = original.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    left, top, right, bottom = alpha.getbbox()
    head = alpha.crop((left, top, right, top + round((bottom-top)*.32))).getbbox()
    scale = 960 / original.height
    layout = dict(height=(bottom-top)*scale, top=top*scale,
                  center=(left+(head[0]+head[2])/2)*scale,
                  widthScale=((right-left)/(bottom-top))/(frames[0]['width']/frames[0]['height']))
    dest = ROOT / f'public/assets/music-image-motion/{id_}-v2.webp'
    image.save(dest, 'WEBP', quality=90, method=6)
    registry[id_] = dict(src=f'/assets/music-image-motion/{dest.name}', width=image.width, height=image.height, frames=frames, layout=layout)
    assert len(frames) == 16 and all(frame['height'] > 0 for frame in frames)
registry_path.write_text(json.dumps(registry, indent=2)+'\n', encoding='utf-8')
print('Installed paired music characters: ' + ', '.join(FILES))
