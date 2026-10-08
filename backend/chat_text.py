"""Turn assistant formatting and song references into readable companion copy."""
import re


def clean_assistant_text(text):
    # Song links use JSON as their destination, not a URL. Keep the song label.
    text = re.sub(r"\[([^\]\n]+)\]\s*\(\s*\{[^{}]*\}\s*\)", r"\1", text)
    text = re.sub(r"\(?\s*\{[^{}]*[\"'](?:mixsongid|song_list_id|msgtype)[\"']\s*:[^{}]*\}\s*\)?", "", text)
    # Code blocks are implementation details, never part of music companion copy.
    text = re.sub(r"```[\s\S]*?(?:```|$)", "", text)
    text = re.sub(r"\[([^\]\n]+)\]\([^\n)]*\)", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^\s*[-*+]\s+", "• ", text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
