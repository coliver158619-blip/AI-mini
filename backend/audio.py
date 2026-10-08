"""Short original instrumental sketches, generated locally without downloads."""

from array import array
from functools import lru_cache
from io import BytesIO
import math
import sys
import wave


@lru_cache(maxsize=12)
def generate_preview(seed):
    rate, duration = 16000, 32
    scales = [(0, 4, 7, 12, 7, 4, 2, 7), (0, 3, 7, 10, 7, 5, 3, 0), (0, 5, 9, 12, 9, 7, 5, 2)]
    notes = scales[seed % len(scales)]
    root = 196 * 2 ** ((seed % 5) / 12)
    samples = array("h")
    for i in range(rate * duration):
        t = i / rate
        step, phase = int(t / 0.5), t % 0.5
        pitch = root * 2 ** (notes[step % len(notes)] / 12)
        envelope = min(1, phase / 0.025) * math.exp(-phase * 6)
        melody = (math.sin(math.tau * pitch * t) + 0.2 * math.sin(math.tau * pitch * 2 * t)) * envelope
        chord = (math.sin(math.tau * root / 2 * t) + math.sin(math.tau * root * 0.75 * t)) * 0.15
        fade = min(1, t / 1.2, (duration - t) / 2)
        samples.append(int(9000 * (melody * 0.65 + chord) * fade))
    if sys.byteorder != "little":
        samples.byteswap()
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples.tobytes())
    return output.getvalue()
