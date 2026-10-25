"""Measure generated full-body atlases and encode WebP without editing their pixels.

Input: output/motion-all-sources/<outfit ID>.png. Existing approved atlases stay intact.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def measure(path):
    image = Image.open(path).convert('RGBA')
    alpha = image.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    w, h = image.size
    # Locate transparent gutters near each nominal row boundary, not fixed grid cuts.
    rows = [sum(alpha.crop((0, y, w, y + 1)).getdata()) for y in range(h)]
    cuts = [0] + [min(range(round(h * (i / 4 - .07)), round(h * (i / 4 + .07))), key=lambda y: rows[y]) for i in range(1, 4)] + [h]
    frames = []
    for row in range(4):
        for col in range(4):
            x0, x1 = round(w * col / 4), round(w * (col + 1) / 4)
            y0, y1 = cuts[row], cuts[row + 1]
            bbox = alpha.crop((x0, y0, x1, y1)).getbbox()
            assert bbox, f'{path.stem}: empty frame {len(frames)}'
            left, top, right, bottom = bbox
            left += x0; right += x0; top += y0; bottom += y0
            # Head center remains stable while the free hand and props change width.
            head = alpha.crop((left, top, right, top + round((bottom - top) * .32))).getbbox()
            anchor = 100 * (head[0] + head[2]) / 2 / (right - left)
            frames.append(dict(x=left, y=top, width=right-left, height=bottom-top, anchor=round(anchor, 4)))
    return image, frames


def main():
    registry_path = ROOT / 'src/character-motion-v2.json'
    registry = json.loads(registry_path.read_text(encoding='utf-8'))
    valid = json.loads((ROOT / 'src/character-metrics.json').read_text(encoding='utf-8'))
    target = ROOT / 'public/assets/outfit-motion'
    target.mkdir(parents=True, exist_ok=True)
    report = []
    for path in sorted((ROOT / 'output/motion-all-sources').glob('*.png')):
        assert path.stem in valid and path.stem not in ('lyn22', 'zsh09')
        image, frames = measure(path)
        dest = target / f'{path.stem}-v1.webp'
        image.save(dest, 'WEBP', quality=90, method=6)
        registry[path.stem] = dict(src=f'/assets/outfit-motion/{dest.name}', width=image.width, height=image.height, frames=frames)
        report.append(dict(id=path.stem, bytes=dest.stat().st_size, heights=[f['height'] for f in frames]))
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
