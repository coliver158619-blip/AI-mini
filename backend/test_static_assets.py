import gzip
from pathlib import Path
import tempfile
import unittest

from flask import Flask
from backend.static_assets import frontend_file, compressed_bundle


class StaticAssetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'assets').mkdir()
        self.body = b'const song = "hello";\n' * 200
        (self.root / 'assets/app-12345678.js').write_bytes(self.body)
        (self.root / 'assets/room-v1.webp').write_bytes(b'webp fixture')
        (self.root / 'index.html').write_text('<html>home</html>')
        app = Flask(__name__)
        app.add_url_rule('/<path:filename>', view_func=lambda filename: frontend_file(self.root, filename))
        self.client = app.test_client()

    def tearDown(self):
        compressed_bundle.cache_clear()
        self.temp.cleanup()

    def test_gzip_cached_and_revalidated(self):
        with self.client.get('/assets/app-12345678.js', headers={'Accept-Encoding': 'gzip'}) as response:
            self.assertEqual(gzip.decompress(response.data), self.body)
            self.assertLess(len(response.data), len(self.body) / 2)
            self.assertIn('immutable', response.headers['Cache-Control'])
            self.assertIn('Accept-Encoding', response.headers['Vary'])
            etag = response.headers['ETag']
        with self.client.get('/assets/app-12345678.js', headers={'Accept-Encoding': 'gzip', 'If-None-Match': etag}) as response:
            self.assertEqual(response.status_code, 304)
        self.assertGreaterEqual(compressed_bundle.cache_info().hits, 1)
        (self.root / 'assets/app-12345678.js').write_bytes(self.body + b'// changed')
        with self.client.get('/assets/app-12345678.js', headers={'Accept-Encoding': 'gzip', 'If-None-Match': etag}) as response:
            self.assertEqual(response.status_code, 200)
            self.assertTrue(gzip.decompress(response.data).endswith(b'// changed'))

    def test_plain_range_and_html(self):
        with self.client.get('/assets/app-12345678.js', headers={'Accept-Encoding': 'gzip;q=0'}) as response:
            self.assertNotIn('Content-Encoding', response.headers)
            self.assertEqual(response.data, self.body)
        with self.client.get('/assets/app-12345678.js', headers={'Accept-Encoding': 'gzip', 'Range': 'bytes=0-9'}) as response:
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response.data, self.body[:10])
        with self.client.get('/index.html') as response:
            self.assertEqual(response.headers['Cache-Control'], 'no-cache')
        with self.client.get('/assets/room-v1.webp') as response:
            self.assertIn('max-age=86400', response.headers['Cache-Control'])
        with self.client.get('/../outside.js') as response:
            self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()
