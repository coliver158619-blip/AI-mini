"""Measure static head offsets for an equally spaced note; never modify source images."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
metrics = json.loads((root / 'src/character-metrics.json').read_text())
offsets = {}
for key, bounds in metrics.items():
    image = Image.open(root / f'public/assets/characters/web-v1/{key}.webp').convert('RGBA')
    alpha = image.getchannel('A').point(lambda value: 255 if value > 128 else 0)
    left, top, right, bottom = alpha.getbbox()
    head = alpha.crop((left, top, right, top + round((bottom-top)*.32))).getbbox()
    head_percent = (left + (head[0]+head[2])/2) / image.width * 100
    offsets[key] = round((head_percent-bounds['center'])/100*bounds['height']*image.width/image.height, 6)
    assert abs(offsets[key]) < .25, f'Unexpected subject position: {key}'
(root / 'src/couple-subject-offsets.json').write_text(json.dumps(offsets, indent=2)+'\n')
