"""Cache public assets and reuse compressed bundles within this process."""
from functools import lru_cache
import gzip
from io import BytesIO
import mimetypes
from pathlib import Path
import re

from flask import request, send_file, send_from_directory
from werkzeug.security import safe_join


@lru_cache(maxsize=16)
def compressed_bundle(path, modified_ns, size):
    return gzip.compress(Path(path).read_bytes(), compresslevel=6, mtime=0)


def frontend_file(directory, filename):
    resolved = safe_join(str(directory), filename)
    asset = Path(resolved) if resolved else None
    if not asset or not asset.is_file():
        return send_from_directory(directory, filename)
    is_asset = filename.startswith('assets/')
    immutable = bool(re.fullmatch(r'assets/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)', filename))
    max_age = 31536000 if immutable else 86400 if is_asset else 0
    compressible = asset.suffix in ('.js', '.css', '.svg') and asset.stat().st_size <= 2 * 1024 * 1024
    if compressible and request.accept_encodings['gzip'] > 0 and 'Range' not in request.headers:
        stat = asset.stat()
        response = send_file(BytesIO(compressed_bundle(str(asset), stat.st_mtime_ns, stat.st_size)),
                             mimetype=mimetypes.guess_type(filename)[0], conditional=True,
                             etag=f'{stat.st_mtime_ns}-{stat.st_size}-gzip',
                             last_modified=stat.st_mtime, max_age=max_age)
        response.headers['Content-Encoding'] = 'gzip'
    else:
        response = send_from_directory(directory, filename, max_age=max_age)
    if compressible:
        response.vary.add('Accept-Encoding')
    if immutable:
        response.cache_control.immutable = True
    if not is_asset:
        response.headers['Cache-Control'] = 'no-cache'
    return response
