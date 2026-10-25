"""Generate H5 WebP variants; keep the original PNG names for native widgets.

Run with a Python environment containing Pillow. No runtime dependency is added.
"""
from pathlib import Path
from PIL import Image


def main():
    root = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'characters'
    sources = sorted(root.glob('*.png'))
    original = sum(path.stat().st_size for path in sources)
    for folder, size, quality in [('thumb-v1', 320, 82), ('web-v1', 768, 86)]:
        target = root / folder
        target.mkdir(exist_ok=True)
        total = 0
        for source in sources:
            with Image.open(source) as image:
                image = image.convert('RGBA')
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                output = target / (source.stem + '.webp')
                image.save(output, 'WEBP', quality=quality, method=6)
                with Image.open(output) as check:
                    assert check.size == image.size and check.mode == 'RGBA'
                total += output.stat().st_size
        assert total < original
        print(f'{folder}: {len(sources)} files, {original:,} -> {total:,} bytes ({1-total/original:.1%} smaller)')


if __name__ == '__main__':
    main()
