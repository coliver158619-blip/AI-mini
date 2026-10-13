"""Validated diary source material. Media is stored, never claimed as recognized."""
import json
import math
from pathlib import Path
import uuid


def text(value, label, limit):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"{label}需为不超过 {limit} 字的文字")
    return value.strip()


def read_inputs(db, day):
    row = db.execute("SELECT data FROM diary_inputs WHERE date=?", (day,)).fetchone()
    note = db.execute("SELECT note FROM diary_notes WHERE date=?", (day,)).fetchone()
    value = json.loads(row[0]) if row else {"note": note[0] if note else "", "songId": None,
        "location": None, "attachments": [], "voiceTranscript": ""}
    song = db.execute("SELECT id,title,artist,color,tags FROM songs WHERE id=?", (value.get("songId"),)).fetchone()
    value["song"] = {**dict(song), "tags": json.loads(song["tags"])} if song else None
    return value


def attachment_dict(row):
    return {"id": row["id"], "kind": row["kind"], "url": "/api/diary/attachments/" + row["id"],
            "mimeType": row["mime_type"], "name": row["name"], "caption": ""}


def save_inputs(db, day, body, at):
    if at.date().isoformat() != day:
        raise ValueError("这一天已结束，请记录今天的日记")
    value = read_inputs(db, day)
    value.pop("song", None)
    if "note" in body:
        value["note"] = text(body["note"], "日记", 300)
    if "voiceTranscript" in body:
        value["voiceTranscript"] = text(body["voiceTranscript"], "语音文字", 2000)
    if "songId" in body:
        song_id = body["songId"]
        if song_id is not None and (not isinstance(song_id, str) or not db.execute("SELECT 1 FROM songs WHERE id=?", (song_id,)).fetchone()):
            raise ValueError("请选择已有歌曲")
        value["songId"] = song_id
    if "location" in body:
        location = body["location"]
        if location is not None:
            if not isinstance(location, dict):
                raise ValueError("位置格式不正确")
            clean = {"text": text(location.get("text"), "位置", 120)}
            if not clean["text"]:
                raise ValueError("请填写位置名称")
            if ("latitude" in location) != ("longitude" in location):
                raise ValueError("位置坐标需同时包含经纬度")
            for field, limit in (("latitude", 90), ("longitude", 180)):
                if field in location:
                    number = location[field]
                    if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not -limit <= number <= limit:
                        raise ValueError("位置坐标无效")
                    clean[field] = number
            location = clean
        value["location"] = location
    if "attachments" in body:
        items = body["attachments"]
        if not isinstance(items, list) or len(items) > 6:
            raise ValueError("每篇日记最多添加 6 份照片或语音")
        attachments, seen = [], set()
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                raise ValueError("附件格式不正确")
            row = db.execute("SELECT id,kind,mime_type,name FROM diary_attachments WHERE id=? AND date=?", (item["id"], day)).fetchone()
            if not row or item["id"] in seen:
                raise ValueError("附件不存在、不属于当天或重复添加")
            seen.add(item["id"])
            attachments.append({**attachment_dict(row), "caption": text(item.get("caption", ""), "附件说明", 300)})
        value["attachments"] = attachments
    if not any(value.get(field) for field in ("note", "songId", "location", "attachments", "voiceTranscript")):
        raise ValueError("先写下今天的故事，或添加歌曲、照片、语音、位置")
    with db:
        db.execute("INSERT INTO diary_inputs VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
                   (day, json.dumps(value, ensure_ascii=False), at.isoformat()))
        db.execute("INSERT INTO diary_notes VALUES (?,?) ON CONFLICT(date) DO UPDATE SET note=excluded.note", (day, value["note"]))
    return value


def save_attachment(db, day, upload, kind, at):
    if at.date().isoformat() != day:
        raise ValueError("这一天已结束，请记录今天的日记")
    if kind not in ("photo", "camera", "voice") or upload is None:
        raise ValueError("请选择照片、拍照或语音文件")
    limit = (16 if kind == "voice" else 8) * 1024 * 1024
    try:
        raw = upload.stream.read(limit + 1)
    finally:
        upload.close()
    if not raw or len(raw) > limit:
        raise ValueError(f"文件不能为空，且需小于 {limit // 1024 // 1024} MB")
    if db.execute("SELECT count(*) FROM diary_attachments WHERE date=?", (day,)).fetchone()[0] >= 24:
        raise ValueError("今天上传的素材已达到上限，请使用已有素材")
    mime = None
    if kind in ("photo", "camera"):
        if raw.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif raw.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif raw.startswith((b"GIF87a", b"GIF89a")):
            mime = "image/gif"
        elif raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
            mime = "image/webp"
    else:
        if raw.startswith(b"RIFF") and raw[8:12] == b"WAVE":
            mime = "audio/wav"
        elif raw.startswith(b"OggS"):
            mime = "audio/ogg"
        elif raw.startswith(b"\x1aE\xdf\xa3"):
            mime = "audio/webm"
        elif raw[4:8] == b"ftyp":
            mime = "audio/mp4"
        elif raw.startswith(b"ID3") or (len(raw) >= 2 and raw[0] == 255 and raw[1] & 224 == 224):
            mime = "audio/mpeg"
    if not mime:
        raise ValueError("暂不支持该文件格式，请使用 JPG/PNG/WebP/GIF 照片或常见音频格式")
    identifier = str(uuid.uuid4())
    name = Path((upload.filename or "素材").replace("\\", "/")).name[:160]
    with db:
        db.execute("INSERT INTO diary_attachments VALUES (?,?,?,?,?,?,?,?)", (identifier, day, kind, mime, name, raw, len(raw), at.isoformat()))
    return {"id": identifier, "kind": kind, "url": "/api/diary/attachments/" + identifier,
            "mimeType": mime, "name": name, "caption": ""}
